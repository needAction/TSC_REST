const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  HeartbeatLease
} = require("../dist/common/liveness/HeartbeatLease");

test("마지막 수신 이후 10000ms부터 만료된다", () => {
  const clock = { elapsedMilliseconds: 0 };
  const lease = new HeartbeatLease(clock, 10000);

  clock.elapsedMilliseconds = 9999;
  assert.equal(lease.isExpired, false);

  clock.elapsedMilliseconds = 10000;
  assert.equal(lease.isExpired, true);

  // 만료 검사 후에도 늦은 요청으로 갱신할 수 없습니다.
  assert.equal(lease.tryRenew(), false);
  assert.equal(lease.isExpired, true);
});

test("생존 확인을 받으면 만료 기준이 갱신된다", () => {
  const clock = { elapsedMilliseconds: 0 };
  const lease = new HeartbeatLease(clock, 10000);

  clock.elapsedMilliseconds = 3000;
  assert.equal(lease.tryRenew(), true);

  clock.elapsedMilliseconds = 12999;
  assert.equal(lease.isExpired, false);

  // 갱신한 3000ms부터 10000ms가 지났습니다.
  clock.elapsedMilliseconds = 13000;
  assert.equal(lease.isExpired, true);
});

test("검사 타이머가 실행되지 않았어도 만료된 요청은 거부한다", () => {
  const clock = { elapsedMilliseconds: 0 };
  const lease = new HeartbeatLease(clock, 10000);

  clock.elapsedMilliseconds = 10001;

  // isExpired를 먼저 확인하지 않고 갱신해도 거부해야 합니다.
  assert.equal(lease.tryRenew(), false);
  assert.equal(lease.isExpired, true);
});

test("잘못된 만료 시간은 거부한다", () => {
  const clock = { elapsedMilliseconds: 0 };

  for (const timeoutMs of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => new HeartbeatLease(clock, timeoutMs));
  }
});