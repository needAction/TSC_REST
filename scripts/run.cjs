const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { parseEnv } = require("node:util");

const projectRoot = path.resolve(__dirname, "..");

function loadEnvironment(profile, inherited = process.env, root = projectRoot) {
  if (!['local', 'test'].includes(profile)) {
    throw new Error("실행 환경은 local 또는 test여야 합니다.");
  }

  const envFile = path.join(root, `.env.${profile}`);
  if (!existsSync(envFile)) {
    throw new Error(`.env.${profile}.example을 .env.${profile}로 복사하고 설정하세요.`);
  }

  const fileValues = parseEnv(readFileSync(envFile, "utf8"));
  // 외부에서 주입된 환경변수가 파일보다 우선합니다. Windows의 키 대소문자도 처리합니다.
  const environment = { ...fileValues };
  for (const [key, value] of Object.entries(inherited)) {
    if (value === undefined) continue;
    if (process.platform === "win32") {
      for (const existing of Object.keys(environment)) {
        if (existing.toUpperCase() === key.toUpperCase()) delete environment[existing];
      }
      environment[key.toUpperCase()] = value;
    } else {
      environment[key] = value;
    }
  }
  return environment;
}

function main() {
  if (Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("이 실행 도구는 Node.js 24 이상이 필요합니다.");
  }
  if (process.argv.length !== 3) {
    throw new Error("사용법: node scripts/run.cjs <local|test>");
  }

  const profile = process.argv[2];
  const environment = loadEnvironment(profile);
  const compiler = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(compiler)) {
    throw new Error("의존성이 없습니다. 프로젝트 폴더에서 npm ci를 먼저 실행하세요.");
  }

  console.log(`[실행] 환경: ${profile} / TypeScript 빌드 시작`);
  // npm.cmd나 셸 명령에 의존하지 않고 현재 Node로 컴파일러를 실행합니다.
  const build = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
    cwd: projectRoot,
    stdio: "inherit"
  });
  if (build.error) throw build.error;
  if (build.status !== 0) {
    console.error("빌드가 실패하여 서버를 실행하지 않았습니다.");
    process.exitCode = build.status ?? 1;
    return;
  }

  const { loadServerConfig } = require(path.join(projectRoot, "dist", "config", "ServerConfig.js"));
  const config = loadServerConfig(environment);
  console.log(`[실행] 빌드 성공 / 수신 주소: ${config.host}, 포트: ${config.port}`);
  const server = spawn(process.execPath, [path.join(projectRoot, "dist", "main.js")], {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit"
  });
  const stop = signal => {
    if (!server.killed) server.kill(signal);
  };
  const onInterrupt = () => stop("SIGINT");
  const onTerminate = () => stop("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  server.on("error", error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.on("close", (code, signal) => {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}

if (require.main === module) {
  try {
    main();
  }
  catch (error) {
    console.error(`[실행 오류] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { loadEnvironment };
