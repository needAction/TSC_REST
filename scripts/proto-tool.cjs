const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { ServerTarget, UnityTarget, Deployment, hash } = require("./protocol-tool/Deployment.cjs");
const root = path.resolve(__dirname, "..");
const cache = path.join(root, ".protocol-tools");

function walk(directory, extension) {
  const files = {};
  function visit(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error("생성 입력의 심볼릭 링크는 지원하지 않습니다.");
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), name + "/");
      else if (name.endsWith(extension)) files[name] = fs.readFileSync(path.join(current, entry.name));
    }
  }
  visit(directory, "");
  if (!Object.keys(files).length) throw new Error(`파일이 없습니다: ${directory}`);
  return files;
}

function fingerprint() {
  const contracts = walk(path.join(root, "protocol/escape"), ".proto");
  const contractHash = hash(Buffer.from(JSON.stringify(Object.entries(contracts).map(([name, value]) => [name, hash(value)]))));
  const tools = { tsProto: require("ts-proto/package.json").version, grpcTools: "2.76.0", csharpRuntime: "3.33.0" };
  const inputs = ["protocol/http/openapi.json", "scripts/generate-http-api.cjs", "scripts/protocol-tool/Deployment.cjs", "package-lock.json", "scripts/generate-protocol.cjs", "scripts/verify-protocol.cjs", "protocol/verification/csharp/ProtocolVerification.csproj",
    "protocol/verification/csharp/Program.cs", "protocol/verification/csharp/packages.lock.json"];
  return {
    contractHash, tools, fingerprint: hash(Buffer.from(JSON.stringify({
      contractHash, tools,
      inputs: inputs.map(name => [name, hash(fs.readFileSync(path.join(root, name)))])
    })))
  };
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`작업 실패: ${script}`);
}

function generateVerified() {
  const before = fingerprint();
  const stage = path.join(cache, "stages", crypto.randomUUID());
  run("generate-protocol.cjs", ["--stage", stage]);
  run("verify-protocol.cjs", ["--stage", stage]);
  if (fingerprint().fingerprint !== before.fingerprint) throw new Error("검증 중 계약/도구가 변경됐습니다.");
  const manifest = { ...before, outputs: {} };
  for (const [folder, extension] of [["typescript", ".ts"], ["csharp", ".cs"]]) {
    manifest.outputs[folder] = Object.fromEntries(Object.entries(walk(path.join(stage, folder), extension)).map(([name, value]) => [name, hash(value)]));
  }
  fs.writeFileSync(path.join(stage, "verification.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(cache, "latest-verified.json"), JSON.stringify({ stage }));
  console.log("검증 완료: " + stage);
}

function readVerified() {
  const { stage } = JSON.parse(fs.readFileSync(path.join(cache, "latest-verified.json"), "utf8"));
  const allowedRoot = fs.realpathSync(path.join(cache, "stages"));
  const actualStage = fs.realpathSync(stage);
  if (path.relative(allowedRoot, actualStage).startsWith("..") || path.isAbsolute(path.relative(allowedRoot, actualStage)))
    throw new Error("검증 결과 경로가 허용 범위를 벗어납니다.");
  const verification = JSON.parse(fs.readFileSync(path.join(actualStage, "verification.json"), "utf8"));
  if (verification.fingerprint !== fingerprint().fingerprint) throw new Error("계약/도구가 변경됐습니다. proto:sync를 실행하세요.");
  const outputs = {};
  for (const [folder, extension] of [["typescript", ".ts"], ["csharp", ".cs"]]) {
    outputs[folder] = walk(path.join(actualStage, folder), extension);
    const hashes = Object.fromEntries(Object.entries(outputs[folder]).map(([name, value]) => [name, hash(value)]));
    if (JSON.stringify(hashes) !== JSON.stringify(verification.outputs[folder])) throw new Error("검증 후 생성 코드가 변경됐습니다.");
  }
  return { verification, outputs };
}

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  let target = "both";
  let configPath = path.join(root, "protocol.projects.local.json");
  let apply = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === "--apply") apply = true;
    else if (argument === "--target" && args.length) target = args.shift();
    else if (argument === "--config" && args.length) configPath = path.resolve(root, args.shift());
    else throw new Error("사용법: proto-tool.cjs <sync|deploy|verify> [--target server|client|both] [--config 파일] [--apply]");
  }
  if (!["server", "client", "both"].includes(target)) throw new Error("잘못된 배포 대상입니다.");
  if (!["sync", "deploy", "verify"].includes(command)) throw new Error("명령은 sync, deploy, verify입니다.");
  if (command !== "deploy") generateVerified();
  if (command === "verify") return;
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const { verification, outputs } = readVerified();
  const targets = [];
  const resolveProject = field => {
    if (typeof config[field] !== "string" || !config[field].trim()) throw new Error(`${field} 경로가 필요합니다.`);
    return path.resolve(path.dirname(configPath), config[field]);
  };
  if (target !== "client") targets.push(new ServerTarget(resolveProject("serverProject"), outputs.typescript, verification));
  if (target !== "server") targets.push(new UnityTarget(resolveProject("clientProject"), outputs.csharp, verification));
  const writes = targets.flatMap(item => item.plan());
  for (const write of writes) console.log(`${write.changed ? "변경" : "동일"}: ${write.destination}`);
  if (!apply) {
    console.log("변경 예정 목록입니다. 적용은 --apply를 추가하세요.");
    return;
  }
  const backupRoot = path.join(cache, "backups", crypto.randomUUID());
  new Deployment(backupRoot).apply(writes);
  console.log("배포 완료. 기존 파일 백업: " + backupRoot);
  if (target !== "server") console.log("Unity 생성 어셈블리는 ESCAPE_PROTOBUF_RUNTIME 정의 전까지 비활성입니다. 런타임 구성 후 활성화하세요.");
}

try {
  main();
} catch (error) {
  console.error("[Protobuf 도구] " + error.message);
  process.exitCode = 1;
}
