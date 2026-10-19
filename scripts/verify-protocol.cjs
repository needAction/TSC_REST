const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`검증 명령 실패: ${command} (${result.status ?? result.signal})`);
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--stage")) throw new Error("사용법: verify-protocol.cjs [--stage 폴더]");
  const stage = args.length ? path.resolve(args[1]) : undefined;
  let compiledDirectory = path.join(root, "dist/generated");
  let csharpExecutable = "protocol/verification/csharp/bin/Debug/net10.0/ProtocolVerification.dll";
  if (stage) {
    compiledDirectory = path.join(stage, "compiled");
    const tsConfigPath = path.join(stage, "tsconfig.json");
    fs.writeFileSync(tsConfigPath, JSON.stringify({ compilerOptions: {
      target: "ES2022", module: "CommonJS", strict: true, skipLibCheck: true,
      rootDir: path.join(stage, "typescript"), outDir: compiledDirectory, types: ["node"]
    }, include: [path.join(stage, "typescript/**/*.ts")] }, null, 2));
    run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", tsConfigPath]);
    const csOutput = path.join(stage, "csharp-build");
    run("dotnet", ["build", "protocol/verification/csharp/ProtocolVerification.csproj", "--no-restore", "--verbosity", "quiet",
      `-p:ProtocolGeneratedDirectory=${path.join(stage, "csharp")}`, "--output", csOutput]);
    csharpExecutable = path.join(csOutput, "ProtocolVerification.dll");
  } else {
    run(process.execPath, ["scripts/generate-protocol.cjs"]);
    run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
    run("dotnet", ["build", "protocol/verification/csharp/ProtocolVerification.csproj", "--no-restore", "--verbosity", "quiet"]);
  }

  const { QuerySessionResponse, SessionPhase, PlayerRole } = require(path.join(compiledDirectory, "escape/v1/session"));
  const { SessionErrorCode } = require(path.join(compiledDirectory, "escape/v1/common"));
  const fixtureRoot = stage ?? path.join(root, ".protocol-tools");
  const tsFolder = path.join(fixtureRoot, "fixtures/typescript");
  const csFolder = path.join(fixtureRoot, "fixtures/csharp");
  fs.mkdirSync(tsFolder, { recursive: true });
  fs.mkdirSync(csFolder, { recursive: true });

  const cases = {
    success: { outcome: { $case: "snapshot", snapshot: {
      sessionId: "session-001", phase: SessionPhase.LOADING, unlockedRoomIds: [],
      players: [
        { playerId: "player-a", role: PlayerRole.ROLE_A, sceneLoaded: true },
        { playerId: "player-b", role: PlayerRole.ROLE_B, sceneLoaded: false }
      ]
    }}},
    failure: { outcome: { $case: "failure", failure: { code: SessionErrorCode.INVALID_PARTICIPANT } } },
    empty: { outcome: undefined },
    unknown: { outcome: { $case: "failure", failure: { code: 999 } } },
    "default-failure": { outcome: { $case: "failure", failure: { code: SessionErrorCode.SESSION_ERROR_CODE_UNSPECIFIED } } }
  };
  for (const [name, message] of Object.entries(cases)) {
    const bytes = QuerySessionResponse.encode(message).finish();
    assert.deepEqual(QuerySessionResponse.decode(bytes), message);
    fs.writeFileSync(path.join(tsFolder, name + ".bin"), bytes);
  }
  // 두 분기가 바이트에 존재하면 마지막 분기가 선택되는지 양쪽에서 확인합니다.
  const lastOneof = Buffer.concat([
    QuerySessionResponse.encode(cases.success).finish(),
    QuerySessionResponse.encode(cases.failure).finish()
  ]);
  assert.deepEqual(QuerySessionResponse.decode(lastOneof), cases.failure);
  fs.writeFileSync(path.join(tsFolder, "last-oneof.bin"), lastOneof);
  assert.throws(() => QuerySessionResponse.decode(Uint8Array.from([10, 5, 1])));

  run("dotnet", [csharpExecutable, tsFolder, csFolder]);
  for (const [name, message] of Object.entries(cases)) {
    assert.deepEqual(QuerySessionResponse.decode(fs.readFileSync(path.join(csFolder, name + ".bin"))), message);
  }
  assert.deepEqual(QuerySessionResponse.decode(fs.readFileSync(path.join(csFolder, "last-oneof.bin"))), cases.failure);
  const csSuccess = QuerySessionResponse.decode(fs.readFileSync(path.join(csFolder, "csharp-success.bin")));
  assert.equal(csSuccess.outcome.$case, "snapshot");
  assert.deepEqual(csSuccess.outcome.snapshot, {
    sessionId: "csharp-session", phase: SessionPhase.WAITING, unlockedRoomIds: [],
    players: [{ playerId: "csharp-a", role: PlayerRole.ROLE_A, sceneLoaded: true }]
  });
  assert.deepEqual(QuerySessionResponse.decode(fs.readFileSync(path.join(csFolder, "csharp-failure.bin"))), {
    outcome: { $case: "failure", failure: { code: SessionErrorCode.SESSION_NOT_FOUND } }
  });
  console.log("Protobuf 교차 검증 통과: TS → C# → TS, C# → TS, oneof, 기본값, 미지 enum, 잘린 데이터 거부");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
