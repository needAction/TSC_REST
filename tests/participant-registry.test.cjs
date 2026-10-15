const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  ParticipantRegistry
} = require("../dist/services/ParticipantRegistry");

function createRegistry() {
  const clock = { elapsedMilliseconds: 0 };
  const registry = new ParticipantRegistry(clock, 10000);

  return { clock, registry };
}

test("생존 확인한 참가자만 유지하고 만료 참가자를 제거한다", () => {
  const { clock, registry } = createRegistry();

  registry.register("token-a", "player-a");
  registry.register("token-b", "player-b");

  clock.elapsedMilliseconds = 3000;
  assert.equal(registry.heartbeat("token-b"), true);

  clock.elapsedMilliseconds = 10000;

  assert.equal(registry.getPlayerId("token-a"), undefined);
  assert.equal(registry.getPlayerId("token-b"), "player-b");
  assert.deepEqual(registry.getExpiredTokens(), ["token-a"]);

  assert.equal(registry.remove("token-a"), "player-a");
  assert.equal(registry.remove("token-a"), undefined);
  assert.deepEqual(registry.getExpiredTokens(), []);

  // 다른 참가자는 그대로 남아 있어야 합니다.
  assert.equal(registry.getPlayerId("token-b"), "player-b");
});

test("만료 검사가 실행되기 전에도 늦은 생존 확인을 거부한다", () => {
  const { clock, registry } = createRegistry();

  registry.register("token-a", "player-a");

  clock.elapsedMilliseconds = 10000;

  assert.equal(registry.heartbeat("token-a"), false);
  assert.equal(registry.getPlayerId("token-a"), undefined);
  assert.deepEqual(registry.getExpiredTokens(), ["token-a"]);
});

test("조회와 잘못된 토큰은 생존 시간을 갱신하지 않는다", () => {
  const { clock, registry } = createRegistry();

  registry.register("token-a", "player-a");

  clock.elapsedMilliseconds = 9000;

  assert.equal(registry.getPlayerId("token-a"), "player-a");
  assert.equal(registry.heartbeat("unknown"), false);

  clock.elapsedMilliseconds = 10000;

  assert.equal(registry.getPlayerId("token-a"), undefined);
  assert.deepEqual(registry.getExpiredTokens(), ["token-a"]);
});

test("중복 참가 정보와 잘못된 설정을 거부한다", () => {
  const { clock, registry } = createRegistry();

  registry.register("token-a", "player-a");

  assert.throws(() => registry.register("token-a", "player-b"));
  assert.throws(() => registry.register("token-b", "player-a"));
  assert.throws(() => registry.register("", "player-b"));
  assert.throws(() => registry.register("token-b", " "));

  for (const timeoutMs of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(
      () => new ParticipantRegistry(clock, timeoutMs)
    );
  }

  assert.equal(registry.getPlayerId("token-a"), "player-a");
});