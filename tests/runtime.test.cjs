const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync, copyFileSync, existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { loadEnvironment } = require("../scripts/run.cjs");
const { loadServerConfig } = require("../dist/config/ServerConfig");
const { GameSession } = require("../dist/models/GameSession");
const { SessionService } = require("../dist/services/SessionService");

test("환경 파일 분리와 외부 환경변수 우선순위", () => {
  const root = mkdtempSync(path.join(tmpdir(), "escape-env-test-"));
  const local = path.join(root, ".env.local");
  const shared = path.join(root, ".env.test");
  try {
    writeFileSync(local, 'HOST="127.0.0.1"\nPORT=3000 # local\n');
    writeFileSync(shared, 'HOST=0.0.0.0\nPORT=3001\n');
    assert.deepEqual(loadServerConfig(loadEnvironment("local", {}, root)), { host: "127.0.0.1", port: 3000 });
    assert.deepEqual(loadServerConfig(loadEnvironment("test", {}, root)), { host: "0.0.0.0", port: 3001 });
    assert.equal(loadServerConfig(loadEnvironment("test", { PORT: "8080" }, root)).port, 8080);
    assert.throws(() => loadServerConfig(loadEnvironment("test", { PORT: "bad" }, root)));
    assert.throws(() => loadEnvironment("production", {}, root));
    if (process.platform === "win32") {
      assert.equal(loadServerConfig(loadEnvironment("test", { port: "8081" }, root)).port, 8081);
    }
    unlinkSync(local);
    assert.throws(() => loadEnvironment("local", {}, root), /example/);
  } finally {
    for (const file of [local, shared]) {
      try { unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    rmdirSync(root);
  }
});

test("씬 로딩 완료 보고는 정원 충족 후 Playing으로 전환한다", () => {
  const session = new GameSession({ id: "test", roles: ["A", "B"] });
  const service = new SessionService(session);
  const a = service.join();
  assert.equal(service.ready("test", a.participantToken).snapshot.phase, "Waiting");
  const b = service.join();
  assert.equal(session.phase, "Loading");
  assert.equal(service.join().code, "SESSION_FULL");
  const result = service.ready("test", b.participantToken);
  assert.equal(result.snapshot.sessionId, "test");
  assert.equal(result.snapshot.phase, "Playing");
  assert.equal(service.ready("test", b.participantToken).snapshot.phase, "Playing");
  assert.equal(service.ready("test", "invalid").code, "INVALID_PARTICIPANT");
  assert.equal(service.ready("missing", a.participantToken).code, "SESSION_NOT_FOUND");
  result.snapshot.players[0].ready = false;
  assert.equal(session.phase, "Playing");
});

test("빌드 실패 시 이전 dist 서버를 실행하지 않고 실패 코드를 반환한다", () => {
  const root = mkdtempSync(path.join(tmpdir(), "escape-build-test-"));
  const directories = ["scripts", "node_modules", "node_modules/typescript", "node_modules/typescript/bin", "dist"];
  const files = ["scripts/run.cjs", ".env.local", "node_modules/typescript/bin/tsc", "dist/main.js"];
  const marker = path.join(root, "started.txt");
  try {
    for (const directory of directories) mkdirSync(path.join(root, directory));
    copyFileSync(path.resolve(__dirname, "../scripts/run.cjs"), path.join(root, "scripts/run.cjs"));
    writeFileSync(path.join(root, ".env.local"), "HOST=127.0.0.1\nPORT=3000\n");
    writeFileSync(path.join(root, "node_modules/typescript/bin/tsc"), "process.exit(7);\n");
    writeFileSync(path.join(root, "dist/main.js"), "require('node:fs').writeFileSync('started.txt', 'unexpected');\n");
    const result = spawnSync(process.execPath, [path.join(root, "scripts/run.cjs"), "local"], {
      cwd: tmpdir(), encoding: "utf8", timeout: 10000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 7);
    assert.match(result.stderr, /빌드가 실패/);
    assert.equal(existsSync(marker), false);
  } finally {
    for (const file of [...files, "started.txt"]) {
      try { unlinkSync(path.join(root, file)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    for (const directory of directories.reverse()) rmdirSync(path.join(root, directory));
    rmdirSync(root);
  }
});
