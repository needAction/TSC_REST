const { spawnSync } = require("node:child_process");

// OS별 셸을 사용하지 않고 인자 배열로 Docker CLI를 실행합니다.
class DockerCli {
  constructor(root, inherited = process.env) {
    this.root = root;
    const ignored = new Set(["DOCKER_HOST", "DOCKER_CONTEXT", "BUILDX_BUILDER", "BUILDKIT_HOST", "DOCKER_DEFAULT_PLATFORM"]);
    this.environment = Object.fromEntries(Object.entries(inherited).filter(([key]) => !ignored.has(key.toUpperCase())));
  }
  run(args, { capture = false, timeoutMs } = {}) {
    const result = spawnSync("docker", args, {
      cwd: this.root, env: this.environment, shell: false,
      stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit", encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024
    });
    if (result.error) throw new Error(result.error.code === "ENOENT" ? "Docker CLI가 없습니다. Docker 설치와 PATH를 확인하세요." : `Docker 명령 실행 실패: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`Docker 명령 실패 (종료 코드 ${result.status ?? "없음"})${capture && result.stderr ? ": " + result.stderr.trim().slice(-4000) : ""}`);
    return capture ? result.stdout.trim() : "";
  }
}

class LocalDockerTarget {
  constructor(context) {
    this.context = context;
  }
  resolve(cli) {
    const context = this.context || cli.run(["context", "show"], { capture: true });
    const info = JSON.parse(cli.run(["context", "inspect", context], { capture: true }));
    const endpoint = info[0]?.Endpoints?.docker?.Host;
    if (typeof endpoint !== "string" || !/^(unix|npipe):\/\//.test(endpoint))
      throw new Error("로컬 Docker context가 아닙니다. .env.deploy-local의 DOCKER_CONTEXT에 로컬 context 이름을 지정하세요.");
    return ["--context", context];
  }
}

class SshDockerTarget {
  constructor(address) {
    this.address = address;
  }
  resolve() {
    return ["--host", this.address];
  }
}

module.exports = { DockerCli, LocalDockerTarget, SshDockerTarget };
