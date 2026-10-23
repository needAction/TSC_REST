const path = require("node:path");
const { LocalDockerTarget, SshDockerTarget } = require("./DockerCli.cjs");
const { HealthMonitor, checkPublicHealth } = require("./HealthMonitor.cjs");

// 이미지에 들어 있는 실제 서버 검증기를 사용합니다. 서버 설정 규칙을 도구에 복제하지 않습니다.
const validateRuntime = `(async () => { try {
  const config = require('./dist/config/ServerConfig').loadServerConfig(process.env);
  if (config.host !== '0.0.0.0') throw new Error('Docker 서버 HOST는 0.0.0.0이어야 합니다.');
  if (config.port !== Number(process.argv[1])) throw new Error('서버 PORT와 CONTAINER_PORT가 다릅니다.');
  await require('./dist/infrastructure/data/loadGameData').loadGameData(require('node:path').resolve('data'));
} catch (error) { console.error(error.message); process.exitCode = 1; } })();`;
const checkInternalHealth = `fetch('http://127.0.0.1:' + process.argv[1] + '/health', {
  signal: AbortSignal.timeout(Number(process.argv[2]))
}).then(async response => {
  if (!response.ok || (await response.json()).status !== 'ok') process.exitCode = 1;
}).catch(() => { process.exitCode = 1; });`;

// 배포 순서를 소유하며 Docker 실행·접속 대상·상태 검사 구현은 주입받습니다.
class DockerDeployment {
  constructor(config, cli, { monitor = new HealthMonitor(config), publicHealth = checkPublicHealth, log = console.log } = {}) {
    this.config = config;
    this.cli = cli;
    this.monitor = monitor;
    this.publicHealth = publicHealth;
    this.log = log;
  }
  describe() {
    const c = this.config;
    this.log(`[배포 계획] ${c.profile} / ${c.sshTarget || "로컬 context: " + (c.context || "현재 선택값 확인 후 사용")}`);
    this.log(`이미지: ${c.image} / 컨테이너: ${c.container}`);
    this.log(`서버 환경 파일: ${c.runtimeFile}`);
    this.log(`포트: ${c.publish} / 재시작: ${c.restart} / 상태 확인: ${c.publicHealthUrl}`);
    this.log(`Docker 로그: json-file / 파일당 ${c.logMaxSizeMb}MB / 최대 ${c.logMaxFiles}개 (오래된 로그부터 제거)`);
    this.log("순서: 대상 확인 → 이미지 빌드 → 서버 설정 검증 → 기존 컨테이너 교체 → 로그 → 내부/공개 상태 확인");
  }
  async execute() {
    const c = this.config;
    const logOptions = ["--log-driver", "json-file", "--log-opt", `max-size=${c.logMaxSizeMb}m`,
      "--log-opt", `max-file=${c.logMaxFiles}`];
    this.describe();
    const target = c.profile === "local" ? new LocalDockerTarget(c.context) : new SshDockerTarget(c.sshTarget);
    const prefix = target.resolve(this.cli);
    const run = (args, options) => this.cli.run([...prefix, ...args], options);
    if (run(["info", "--format", "{{.OSType}}"], { capture: true }) !== "linux")
      throw new Error("Linux 컨테이너 엔진이 필요합니다. Docker 실행 모드를 확인하세요.");
    this.log("[1/5] 새 이미지 빌드 (기존 컨테이너 유지)");
    run(["build", "--tag", c.image, "--file", path.join(c.root, "Dockerfile"), c.root]);
    const imageId = run(["image", "inspect", "--format", "{{.Id}}", c.image], { capture: true });
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error("빌드된 이미지 ID를 확인하지 못했습니다.");
    this.log("[2/5] 새 이미지의 서버 환경·CSV 로드·기능 계약 검증");
    run(["run", "--rm", ...logOptions, "--env-file", c.runtimeFile, imageId, "node", "-e", validateRuntime, String(c.containerPort)]);
    this.log("[3/5] 지정한 기존 컨테이너만 교체");
    const exactName = c.container.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const previous = run(["container", "ls", "--all", "--filter", `name=^/${exactName}$`, "--format", "{{.ID}}"], { capture: true });
    if (previous) {
      if (!/^[a-f0-9]{12,64}$/.test(previous)) throw new Error("교체할 컨테이너 ID가 한 개로 확인되지 않았습니다.");
      run(["stop", "--timeout", String(Math.trunc((c.stopTimeoutMs + 999) / 1000)), previous]);
      run(["rm", previous]);
    }
    // 태그가 도중에 변경되어도 검증한 이미지로 실행합니다.
    const containerId = run(["run", "--detach", "--name", c.container, "--restart", c.restart,
      ...logOptions,
      "--env-file", c.runtimeFile, "--publish", c.publish, "--label", `escape.deploy.profile=${c.profile}`, imageId], { capture: true });
    if (!/^[a-f0-9]{12,64}$/.test(containerId)) throw new Error("새 컨테이너 ID를 확인하지 못했습니다.");
    this.log("[4/5] 새 컨테이너 로그");
    try {
      run(["logs", "--tail", "50", containerId]);
      this.log("[5/5] 새 컨테이너 내부와 접속 주소의 /health 확인");
      await this.monitor.wait(async requestBudget => {
        const internalBudget = requestBudget();
        if (internalBudget < 1) return false;
        try {
          // 외부 주소가 다른 서버에 응답해도 새 컨테이너 자체가 정상이어야 통과합니다.
          run(["exec", containerId, "node", "-e", checkInternalHealth, String(c.containerPort), String(internalBudget)],
            { capture: true, timeoutMs: internalBudget });
        } catch {
          return false;
        }
        return this.publicHealth(c.publicHealthUrl, requestBudget());
      });
    } catch (error) {
      this.log("배포 상태 확인에 실패했습니다. 새 컨테이너를 남겨 두고 로그를 표시합니다.");
      try {
        run(["logs", "--tail", "50", containerId]);
      } catch { /* 최초 오류를 유지합니다. */ }
      throw error;
    }
    this.log(`[배포 완료] ${c.container} / ${c.publicHealthUrl} → status: ok`);
  }
}

module.exports = { DockerDeployment, validateRuntime, checkInternalHealth };
