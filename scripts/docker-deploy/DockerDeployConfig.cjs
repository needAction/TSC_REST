const fs = require("node:fs");
const path = require("node:path");
const { isIP } = require("node:net");
const { parseEnv } = require("node:util");

const profiles = Object.freeze({
  local: { file: ".env.deploy-local", runtime: ".env.docker-test", restart: "no" },
  cloud: { file: ".env.deploy-cloud", runtime: ".env.docker-cloud", restart: "unless-stopped" }
});
const keys = new Set(["DOCKER_CONTEXT", "SSH_TARGET", "IMAGE_NAME", "CONTAINER_NAME", "RUNTIME_ENV_FILE",
  "BIND_ADDRESS", "HOST_PORT", "CONTAINER_PORT", "RESTART_POLICY", "PUBLIC_HEALTH_URL",
  "HEALTH_TIMEOUT_MS", "HEALTH_INTERVAL_MS", "HEALTH_REQUEST_TIMEOUT_MS", "STOP_TIMEOUT_MS"]);

function integer(values, key, fallback, maximum = 2147483647) {
  const text = values[key] ?? String(fallback);
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`${key}는 1~${maximum} 범위의 정수여야 합니다.`);
  return value;
}

function healthUrl(text) {
  let url;
  try { url = new URL(text); } catch { throw new Error("PUBLIC_HEALTH_URL에 /health 주소를 입력하세요."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/health")
    throw new Error("PUBLIC_HEALTH_URL은 인증 정보·쿼리 없는 HTTP(S) /health 주소여야 합니다.");
  return url.href;
}

// 배포 도구 설정과 서버 런타임 설정을 구분합니다. 셸 환경으로 배포 대상을 덮어쓰지 않습니다.
class DockerDeployConfig {
  static load(profile, root) {
    const definition = profiles[profile];
    if (!definition) throw new Error("배포 환경은 local 또는 cloud여야 합니다.");
    const file = path.join(root, definition.file);
    if (!fs.existsSync(file)) throw new Error(`${definition.file}.example을 ${definition.file}로 복사하고 설정하세요.`);
    const values = parseEnv(fs.readFileSync(file, "utf8"));
    for (const key of Object.keys(values)) if (!keys.has(key)) throw new Error(`알 수 없는 배포 설정: ${key}`);
    const image = values.IMAGE_NAME;
    const container = values.CONTAINER_NAME;
    if (!image || !/^[a-z0-9][a-z0-9./:_-]*$/.test(image)) throw new Error("IMAGE_NAME 형식을 확인하세요.");
    if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error("CONTAINER_NAME 형식을 확인하세요.");
    const bindAddress = values.BIND_ADDRESS ?? "0.0.0.0";
    const family = isIP(bindAddress);
    if (!family) throw new Error("BIND_ADDRESS는 IPv4 또는 IPv6 주소여야 합니다.");
    const hostPort = integer(values, "HOST_PORT", profile === "local" ? 3001 : 3000, 65535);
    const containerPort = integer(values, "CONTAINER_PORT", 3000, 65535);
    const restart = values.RESTART_POLICY ?? definition.restart;
    if (!["no", "unless-stopped", "always", "on-failure"].includes(restart)) throw new Error("RESTART_POLICY 형식을 확인하세요.");
    const context = values.DOCKER_CONTEXT?.trim() || null;
    if (context && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(context)) throw new Error("DOCKER_CONTEXT 형식을 확인하세요.");
    let sshTarget = null;
    if (profile === "cloud") {
      if (context) throw new Error("cloud는 DOCKER_CONTEXT 대신 SSH_TARGET을 사용합니다.");
      let ssh;
      try { ssh = new URL(values.SSH_TARGET); } catch { throw new Error("SSH_TARGET에 ssh://계정@호스트[:포트]를 입력하세요."); }
      if (ssh.protocol !== "ssh:" || !ssh.hostname || ssh.password || ssh.search || ssh.hash ||
          !["", "/"].includes(ssh.pathname) || (ssh.username && !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(ssh.username)) ||
          (ssh.port && Number(ssh.port) === 0))
        throw new Error("SSH_TARGET에는 SSH 호스트 또는 SSH config 별칭을 입력하세요. 암호나 명령은 넣지 않습니다.");
      sshTarget = ssh.href.replace(/\/$/, "");
      if (!values.PUBLIC_HEALTH_URL) throw new Error("cloud의 PUBLIC_HEALTH_URL에 실제 서버 /health 주소를 입력하세요.");
    } else if (values.SSH_TARGET) throw new Error("local에는 SSH_TARGET을 지정할 수 없습니다.");
    const runtimeFile = path.resolve(root, values.RUNTIME_ENV_FILE || definition.runtime);
    if (!fs.existsSync(runtimeFile) || !fs.statSync(runtimeFile).isFile())
      throw new Error(`서버 환경 파일이 없습니다: ${runtimeFile}`);
    if (!fs.existsSync(path.join(root, "Dockerfile"))) throw new Error("프로젝트 루트에 Dockerfile이 없습니다.");
    const loopback = bindAddress === "0.0.0.0" ? "127.0.0.1" : bindAddress === "::" ? "[::1]" : family === 6 ? `[${bindAddress}]` : bindAddress;
    const publicHealthUrl = healthUrl(values.PUBLIC_HEALTH_URL || `http://${loopback}:${hostPort}/health`);
    const healthTimeoutMs = integer(values, "HEALTH_TIMEOUT_MS", 30000);
    const healthIntervalMs = integer(values, "HEALTH_INTERVAL_MS", 500);
    const healthRequestTimeoutMs = integer(values, "HEALTH_REQUEST_TIMEOUT_MS", 2000);
    if (healthIntervalMs > healthTimeoutMs || healthRequestTimeoutMs > healthTimeoutMs)
      throw new Error("상태 확인 간격과 요청 제한은 HEALTH_TIMEOUT_MS 이하여야 합니다.");
    return Object.freeze({ profile, root, image, container, runtimeFile, context, sshTarget, restart,
      hostPort, containerPort, bindAddress, publicHealthUrl, healthTimeoutMs, healthIntervalMs, healthRequestTimeoutMs,
      stopTimeoutMs: integer(values, "STOP_TIMEOUT_MS", 10000),
      publish: `${family === 6 ? `[${bindAddress}]` : bindAddress}:${hostPort}:${containerPort}` });
  }
}

module.exports = { DockerDeployConfig };
