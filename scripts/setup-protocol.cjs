const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const locked = fs.existsSync(path.join(root, "protocol/verification/csharp/packages.lock.json"));
const result = spawnSync("dotnet", [
  "restore", "protocol/verification/csharp/ProtocolVerification.csproj",
  "--packages", path.join(root, ".protocol-tools/nuget"),
  "--source", "https://api.nuget.org/v3/index.json",
  ...(locked ? ["--locked-mode"] : [])
], { cwd: root, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exitCode = result.status ?? 1;
