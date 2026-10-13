const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const platforms = { win32: "windows", linux: "linux", darwin: "macosx" };
const architectures = { x64: "x64", arm64: "arm64" };
const platform = platforms[process.platform];
const architecture = architectures[process.arch];
if (!platform || !architecture) throw new Error("지원하지 않는 코드 생성 OS/CPU입니다.");
const protoc = path.join(root, ".protocol-tools/nuget/grpc.tools/2.76.0/tools",
  `${platform}_${architecture}`, process.platform === "win32" ? "protoc.exe" : "protoc");
const plugin = path.join(root, "node_modules/.bin", process.platform === "win32" ? "protoc-gen-ts_proto.cmd" : "protoc-gen-ts_proto");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--stage")) throw new Error("사용법: generate-protocol.cjs [--stage 폴더]");
const stage = args.length ? path.resolve(args[1]) : undefined;
const tsOutput = stage ? path.join(stage, "typescript") : path.join(root, "src/generated");
const csOutput = stage ? path.join(stage, "csharp") : path.join(root, "protocol/generated/csharp");
fs.mkdirSync(tsOutput, { recursive: true });
fs.mkdirSync(csOutput, { recursive: true });
if (!fs.existsSync(protoc) || !fs.existsSync(plugin)) {
  console.error("생성 도구가 없습니다. npm ci와 npm run proto:setup을 먼저 실행하세요.");
  process.exit(1);
}
const result = spawnSync(protoc, [
  "--proto_path=protocol",
  `--plugin=protoc-gen-ts_proto=${plugin}`,
  `--ts_proto_out=${tsOutput}`,
  "--ts_proto_opt=oneof=unions,outputServices=false,outputJsonMethods=false,esModuleInterop=true,env=node",
  `--csharp_out=${csOutput}`,
  "escape/v1/common.proto",
  "escape/v1/session.proto"
], { cwd: root, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`protoc 실행 실패: ${result.status ?? result.signal}`);
  process.exit(1);
}
console.log("Protobuf C#·TypeScript 생성 완료");
