const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  GameSession
} = require("../dist/models/GameSession");

const {
  createSessionService
} = require("./helpers/createSessionService.cjs");

function createFixture() {
  const clock = { elapsedMilliseconds: 0 };
  const session = new GameSession({
    id: "test",
    roles: ["A", "B"]
  });

  const service = createSessionService(session, clock);
  return { clock, session, service };
}

test("만료된 참가자의 토큰과 자리를 제거하고 빈 역할을 재배정한다", () => {
  const { clock, session, service } = createFixture();

  const a = service.join();
  const b = service.join();

  service.ready("test", a.participantToken);
  service.ready("test", b.participantToken);

  clock.elapsedMilliseconds = 3000;
  assert.equal(
    service.heartbeat("test", b.participantToken).success,
    true
  );

  clock.elapsedMilliseconds = 10000;
  assert.equal(service.expireParticipants(), 1);
  assert.equal(service.expireParticipants(), 0);

  assert.equal(session.phase, "Waiting");
  assert.deepEqual(
    session.getSnapshot().players.map(player => player.id),
    [b.player.id]
  );

  assert.equal(
    service.query("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );
  assert.equal(
    service.ready("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );
  assert.equal(
    service.heartbeat("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );

  const replacement = service.join();

  assert.equal(replacement.success, true);
  assert.equal(replacement.player.role, "A");
  assert.equal(session.phase, "Loading");

  service.ready("test", replacement.participantToken);
  assert.equal(session.phase, "Playing");
});

test("생존 확인 시점부터 만료 시간을 다시 계산한다", () => {
  const { clock, service } = createFixture();
  const a = service.join();

  clock.elapsedMilliseconds = 3000;
  assert.equal(
    service.heartbeat("test", a.participantToken).success,
    true
  );

  clock.elapsedMilliseconds = 12999;
  assert.equal(
    service.query("test", a.participantToken).success,
    true
  );

  clock.elapsedMilliseconds = 13000;
  assert.equal(
    service.heartbeat("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );
});

test("조회·준비 보고·잘못된 생존 확인은 시간을 갱신하지 않는다", () => {
  const { clock, service } = createFixture();
  const a = service.join();

  clock.elapsedMilliseconds = 9000;

  assert.equal(
    service.query("test", a.participantToken).success,
    true
  );
  assert.equal(
    service.ready("test", a.participantToken).success,
    true
  );
  assert.equal(
    service.heartbeat("missing", a.participantToken).code,
    "SESSION_NOT_FOUND"
  );
  assert.equal(
    service.heartbeat("test", "unknown").code,
    "INVALID_PARTICIPANT"
  );

  clock.elapsedMilliseconds = 10000;

  assert.equal(
    service.query("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );
});

test("주기 검사 전이라도 새 입장 요청이 만료된 자리를 정리한다", () => {
  const { clock, service } = createFixture();

  const a = service.join();
  const b = service.join();

  clock.elapsedMilliseconds = 10000;

  const replacement = service.join();

  assert.equal(replacement.success, true);
  assert.equal(replacement.player.role, "A");

  const result = service.query(
    "test",
    replacement.participantToken
  );

  assert.equal(result.snapshot.players.length, 1);
  assert.equal(
    service.query("test", a.participantToken).code,
    "INVALID_PARTICIPANT"
  );
  assert.equal(
    service.query("test", b.participantToken).code,
    "INVALID_PARTICIPANT"
  );
});