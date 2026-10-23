const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { DockerDeployConfig } = require("../scripts/docker-deploy/DockerDeployConfig.cjs");
const { DockerCli, LocalDockerTarget, SshDockerTarget } = require("../scripts/docker-deploy/DockerCli.cjs");
const { DockerDeployment, validateRuntime, checkInternalHealth } = require("../scripts/docker-deploy/DockerDeployment.cjs");
const { HealthMonitor } = require("../scripts/docker-deploy/HealthMonitor.cjs");

function fixture(t, profile = "local", overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "escape-docker-test-"));
  t.after(() => {
    for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file));
    fs.rmdirSync(root);
  });
  const values = {
    IMAGE_NAME: `escape-server:${profile}`, CONTAINER_NAME: `escape-${profile}`,
    RUNTIME_ENV_FILE: ".env.runtime", HOST_PORT: "3001", CONTAINER_PORT: "3000",
    ...(profile === "cloud" ? { SSH_TARGET: "ssh://deploy@cloud.example.com:2222", PUBLIC_HEALTH_URL: "https://game.example.com/health" } : {}), ...overrides
  };
  const file = path.join(root, `.env.deploy-${profile}`);
  fs.writeFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n"));
  fs.writeFileSync(path.join(root, ".env.runtime"), "HOST=0.0.0.0\nPORT=3000\n");
  fs.writeFileSync(path.join(root, "Dockerfile"), "FROM node:24-bookworm-slim\n");
  return { root, file, load: () => DockerDeployConfig.load(profile, root) };
}
const imageId = "sha256:" + "a".repeat(64);
const oldId = "b".repeat(12);
const newId = "c".repeat(64);
class FakeDocker {
  constructor({ previous = true, fail } = {}) {
    this.calls = [];
    this.previous = previous;
    this.fail = fail;
  }
  run(args, options) {
    this.calls.push({ args, options });
    const cmd = args[0] === "--context" || args[0] === "--host" ? args.slice(2) : args;
    if (this.fail?.(cmd)) throw new Error("simulated " + cmd[0] + " failure");
    if (cmd[0] === "context" && cmd[1] === "show") return "desktop-linux";
    if (cmd[0] === "context" && cmd[1] === "inspect") return JSON.stringify([{ Endpoints: { docker: { Host: "npipe:////./pipe/dockerDesktopLinuxEngine" } } }]);
    if (cmd[0] === "info") return "linux";
    if (cmd[0] === "image") return imageId;
    if (cmd[0] === "container" && cmd[1] === "ls") return this.previous ? oldId : "";
    if (cmd[0] === "run" && cmd.includes("--detach")) return newId;
    return "";
  }
  commands() {
    return this.calls.map(({ args }) => args[0].startsWith("--") ? args.slice(2) : args);
  }
}
function workflow(config, cli, options = {}) {
  const messages = [];
  const monitor = new HealthMonitor({ healthTimeoutMs: 20, healthIntervalMs: 5, healthRequestTimeoutMs: 5 },
    () => monitor.now, async ms => {
      monitor.now += ms;
    });
  monitor.now = 0;
  return {
    messages, deployment: new DockerDeployment(config, cli, {
      monitor, publicHealth: async () => true,
      log: text => messages.push(text), ...options
    })
  };
}

test("Docker 프로필은 배포 설정과 서버 파일을 분리하고 정수 ms와 주소를 검증한다", t => {
  const local = fixture(t);
  const config = local.load();
  assert.equal(config.publish, "0.0.0.0:3001:3000");
  assert.equal(config.publicHealthUrl, "http://127.0.0.1:3001/health");
  assert.equal(config.restart, "no");
  assert.equal(Object.isFrozen(config), true);
  const cloud = fixture(t, "cloud").load();
  assert.equal(cloud.sshTarget, "ssh://deploy@cloud.example.com:2222");
  assert.equal(cloud.restart, "unless-stopped");
  for (const changes of [{ HOST_PORT: "0" }, { CONTAINER_PORT: "65536" }, { HEALTH_TIMEOUT_MS: "1.5" },
  { HEALTH_TIMEOUT_MS: "0" }, { HEALTH_INTERVAL_MS: "30001" }, { HEALTH_REQUEST_TIMEOUT_MS: "30001" },
  { STOP_TIMEOUT_MS: "-1" }, { BIND_ADDRESS: "localhost" }, { CONTAINER_NAME: "-bad" },
  { IMAGE_NAME: "bad;echo" }, { PUBLIC_HEALTH_URL: "https://user:password@host/health" },
  { PUBLIC_HEALTH_URL: "http://host/other" }, { TYPO: "1" }, { SSH_TARGET: "ssh://remote" }])
    assert.throws(() => fixture(t, "local", changes).load());
  for (const changes of [{ SSH_TARGET: "" }, { SSH_TARGET: "tcp://host:2375" },
  { SSH_TARGET: "ssh://user:secret@host" }, { SSH_TARGET: "ssh://host/path" },
  { PUBLIC_HEALTH_URL: "" }, { DOCKER_CONTEXT: "default" }])
    assert.throws(() => fixture(t, "cloud", changes).load());
  const missing = fixture(t);
  fs.unlinkSync(missing.file);
  assert.throws(missing.load, /example/);
});

test("로컬은 원격 context를 거부하고 클라우드 대상은 명시적인 SSH 연결만 사용한다", () => {
  const cli = new FakeDocker();
  assert.deepEqual(new LocalDockerTarget().resolve(cli), ["--context", "desktop-linux"]);
  assert.deepEqual(new SshDockerTarget("ssh://deploy@cloud").resolve(), ["--host", "ssh://deploy@cloud"]);
  for (const endpoint of ["ssh://host", "tcp://127.0.0.1:2375"]) {
    assert.throws(() => new LocalDockerTarget("remote").resolve({ run: () => JSON.stringify([{ Endpoints: { docker: { Host: endpoint } } }]) }), /로컬/);
  }
  const actual = new DockerCli(".", { Path: "keep", docker_host: "ssh://wrong", DOCKER_CONTEXT: "wrong", BUILDX_BUILDER: "wrong", BUILDKIT_HOST: "wrong", DOCKER_DEFAULT_PLATFORM: "wrong" });
  assert.deepEqual(actual.environment, { Path: "keep" });
});

test("Docker 로그 순환 설정은 기존 파일에도 기본값을 적용하고 잘못된 값을 배포 전에 거부한다", t => {
  for (const profile of ["local", "cloud"]) {
    const defaults = fixture(t, profile).load();
    assert.equal(defaults.logMaxSizeMb, 10);
    assert.equal(defaults.logMaxFiles, 3);
    const configured = fixture(t, profile, { LOG_MAX_SIZE_MB: "25", LOG_MAX_FILES: "5" }).load();
    assert.equal(configured.logMaxSizeMb, 25);
    assert.equal(configured.logMaxFiles, 5);
  }
  for (const key of ["LOG_MAX_SIZE_MB", "LOG_MAX_FILES"])
    for (const value of ["", "0", "-1", "1.5", "10m", "NaN", "2147483648", "10;echo"])
      assert.throws(() => fixture(t, "local", { [key]: value }).load(), new RegExp(key));
});

test("로컬·클라우드의 사전 검사와 서비스 컨테이너는 설정한 로그 제한으로 생성된다", async t => {
  for (const profile of ["local", "cloud"]) {
    const config = fixture(t, profile, { LOG_MAX_SIZE_MB: "25", LOG_MAX_FILES: "5" }).load();
    const cli = new FakeDocker();
    const { deployment, messages } = workflow(config, cli);
    await deployment.execute();
    const runs = cli.commands().filter(cmd => cmd[0] === "run");
    assert.equal(runs.length, 2);
    for (const args of runs) {
      assert.equal(args[args.indexOf("--log-driver") + 1], "json-file");
      assert.deepEqual(args.flatMap((value, index) => value === "--log-opt" ? [args[index + 1]] : []),
        ["max-size=25m", "max-file=5"]);
      assert.ok(args.indexOf("max-file=5") < args.indexOf(imageId));
    }
    assert.ok(messages.some(line => line.includes("파일당 25MB / 최대 5개")));
  }
});

test("정상 배포는 새 이미지와 실제 환경을 검증한 뒤 정확한 기존 컨테이너만 교체한다", async t => {
  const config = fixture(t).load();
  const cli = new FakeDocker();
  const { deployment, messages } = workflow(config, cli);
  await deployment.execute();
  const commands = cli.commands();
  assert.equal(commands.some(cmd => cmd[0] === "context" && cmd[1] === "use"), false);
  const build = commands.findIndex(cmd => cmd[0] === "build");
  const validate = commands.findIndex(cmd => cmd[0] === "run" && cmd.includes("--rm"));
  const stop = commands.findIndex(cmd => cmd[0] === "stop");
  const remove = commands.findIndex(cmd => cmd[0] === "rm");
  const start = commands.findIndex(cmd => cmd[0] === "run" && cmd.includes("--detach"));
  assert.ok(build < validate && validate < stop && stop < remove && remove < start);
  assert.deepEqual(commands[stop], ["stop", "--timeout", "10", oldId]);
  assert.deepEqual(commands[remove], ["rm", oldId]);
  assert.equal(commands[start].at(-1), imageId);
  assert.ok(commands[start].includes(config.runtimeFile));
  assert.ok(commands[start].includes("0.0.0.0:3001:3000"));
  assert.ok(commands.find(cmd => cmd[0] === "exec").includes(newId));
  assert.ok(messages.some(line => line.includes("배포 완료")));
});

test("빌드·런타임 검증 실패는 기존 컨테이너에 영향을 주지 않는다", async t => {
  for (const fail of [cmd => cmd[0] === "build", cmd => cmd[0] === "run" && cmd.includes("--rm")]) {
    const cli = new FakeDocker({ fail });
    await assert.rejects(workflow(fixture(t).load(), cli).deployment.execute(), /simulated/);
    assert.equal(cli.commands().some(cmd => ["stop", "rm"].includes(cmd[0]) || cmd.includes("--detach")), false);
  }
});

test("첫 실행은 중지·제거를 생략하고, 중지 실패 시 제거·재실행하지 않는다", async t => {
  const fresh = new FakeDocker({ previous: false });
  await workflow(fixture(t).load(), fresh).deployment.execute();
  assert.equal(fresh.commands().some(cmd => ["stop", "rm"].includes(cmd[0])), false);
  const broken = new FakeDocker({ fail: cmd => cmd[0] === "stop" });
  await assert.rejects(workflow(fixture(t).load(), broken).deployment.execute(), /simulated/);
  assert.equal(broken.commands().some(cmd => cmd[0] === "rm" || cmd.includes("--detach")), false);
});

test("클라우드의 모든 Docker 작업은 지정한 원격 엔진을 사용한다", async t => {
  const config = fixture(t, "cloud").load();
  const cli = new FakeDocker();
  await workflow(config, cli).deployment.execute();
  for (const { args } of cli.calls) assert.deepEqual(args.slice(0, 2), ["--host", config.sshTarget]);
  assert.ok(cli.commands().find(cmd => cmd.includes("--detach")).includes("unless-stopped"));
});

test("잘못된 엔진·교체 대상·새 실행 실패는 이후 작업을 중단하고 성공을 표시하지 않는다", async t => {
  for (const mode of ["engine", "container", "start"]) {
    const cli = new FakeDocker({ fail: cmd => mode === "start" && cmd.includes("--detach") });
    const run = cli.run.bind(cli);
    cli.run = (args, options) => {
      const result = run(args, options);
      const cmd = args[0].startsWith("--") ? args.slice(2) : args;
      if (mode === "engine" && cmd[0] === "info") return "windows";
      if (mode === "container" && cmd[0] === "container") return oldId + "\n" + newId;
      return result;
    };
    const { deployment, messages } = workflow(fixture(t).load(), cli);
    await assert.rejects(deployment.execute());
    assert.equal(messages.some(line => line.startsWith("[배포 완료]")), false);
    assert.equal(cli.commands().some(cmd => cmd[0] === "exec"), false);
    if (mode !== "start") assert.equal(cli.commands().some(cmd => ["stop", "rm"].includes(cmd[0])), false);
  }
});

test("내부 또는 공개 상태 확인 실패를 성공으로 표시하지 않고 진단용 컨테이너를 남긴다", async t => {
  for (const options of [{ publicHealth: async () => false }, {}]) {
    const cli = new FakeDocker({ fail: Object.keys(options).length ? undefined : cmd => cmd[0] === "exec" });
    const { deployment, messages } = workflow(fixture(t).load(), cli, options);
    await assert.rejects(deployment.execute(), /상태 확인 실패/);
    assert.equal(messages.some(text => text.startsWith("[배포 완료]")), false);
    assert.equal(cli.commands().filter(cmd => cmd[0] === "rm").length, 1);
    assert.ok(cli.commands().filter(cmd => cmd[0] === "logs").length >= 2);
  }
});

test("상태 확인은 정수 ms로 재시도하고 제한 시간 후 종료한다", async () => {
  let now = 0;
  let calls = 0;
  const sleeps = [];
  const settings = { healthTimeoutMs: 1000, healthIntervalMs: 300, healthRequestTimeoutMs: 400 };
  const monitor = new HealthMonitor(settings, () => now, async ms => {
    sleeps.push(ms);
    now += ms;
  });
  await assert.rejects(monitor.wait(async budget => {
    assert.equal(Number.isInteger(budget()), true);
    calls++;
    return false;
  }), /1000ms/);
  assert.equal(now, 1000);
  assert.equal(calls, 4);
  assert.deepEqual(sleeps, [300, 300, 300, 100]);
  now = 0;
  calls = 0;
  await monitor.wait(async () => ++calls === 2);
  assert.equal(now, 300);
});

test("사전 검증 코드는 실제 서버 검증기를 사용하고 컨테이너 포트 불일치를 거부한다", () => {
  const env = { ...process.env, HOST: "0.0.0.0", PORT: "3000", PARTICIPANT_TIMEOUT_MS: "10000", EXPIRATION_CHECK_INTERVAL_MS: "500" };
  const run = (port, overrides = {}) => spawnSync(process.execPath, ["-e", validateRuntime, String(port)], {
    cwd: path.resolve(__dirname, ".."), env: { ...env, ...overrides }, encoding: "utf8", timeout: 5000
  });
  assert.equal(run(3000).status, 0);
  assert.equal(run(3001).status, 1);
  assert.equal(run(3000, { HOST: "127.0.0.1" }).status, 1);
  assert.equal(run(3000, { PARTICIPANT_TIMEOUT_MS: "1.5" }).status, 1);
  assert.doesNotThrow(() => new (require("node:vm").Script)(checkInternalHealth));
});
