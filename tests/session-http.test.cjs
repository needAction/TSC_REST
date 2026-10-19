const { test } = require("node:test");
const {readReply}=require("./helpers/protobuf.cjs");
const assert = require("node:assert/strict");
const { GameSession } = require("../dist/models/GameSession");
const { SessionController } = require("../dist/controllers/SessionController");
const { createSessionHttpServer } = require("../dist/infrastructure/http/createSessionHttpServer");
const { createSessionService } = require("./helpers/createSessionService.cjs");

async function createFixture(t) {
  const clock = { elapsedMilliseconds: 0 };
  const session = new GameSession({ id: "test", roles: ["A", "B"] });
  const service = createSessionService(session, clock);
  const server = createSessionHttpServer(new SessionController(service));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = "GET", token) {
    const headers = token === undefined ? {} : { "x-participant-token": token };
    const response = await fetch(baseUrl + path, { method, headers, signal: AbortSignal.timeout(5000) });
    return { status: response.status, headers: response.headers, body: path === "/health" ? await response.json() : await readReply(response) };
  }
  return { clock, session, request };
}

test("실제 HTTP 생존 확인은 성공·토큰 누락·인증 실패·없는 세션을 구분한다", async t => {
  const { request } = await createFixture(t);
  const joined = await request("/sessions/join", "POST");
  assert.equal(joined.status, 201);
  const token = joined.body.participantToken;

  for (const header of [undefined, "", " "]) {
    const missing = await request("/sessions/test/heartbeat", "POST", header);
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.body, { success: false, code: "PARTICIPANT_TOKEN_REQUIRED" });
  }
  const invalid = await request("/sessions/test/heartbeat", "POST", "invalid");
  assert.equal(invalid.status, 403);
  assert.deepEqual(invalid.body, { success: false, code: "INVALID_PARTICIPANT" });
  const missingSession = await request("/sessions/missing/heartbeat", "POST", token);
  assert.equal(missingSession.status, 404);
  assert.deepEqual(missingSession.body, { success: false, code: "SESSION_NOT_FOUND" });

  const confirmed = await request("/sessions/test/heartbeat", "POST", token);
  assert.equal(confirmed.status, 200);
  assert.deepEqual(confirmed.body, { success: true });
  assert.equal(confirmed.headers.get("cache-control"), "no-store");
  assert.match(confirmed.headers.get("content-type"), /application\/protobuf/);
  assert.equal((await request("/sessions/test/heartbeat", "GET", token)).status, 404);
  assert.equal((await request("/sessions/test/unknown", "POST", token)).status, 404);
  assert.deepEqual((await request("/health")).body, { status: "ok" });
});

test("생존 확인은 준비 상태를 바꾸지 않고 만료된 토큰은 HTTP에서도 거부한다", async t => {
  const { clock, session, request } = await createFixture(t);
  const a = (await request("/sessions/join", "POST")).body;
  const b = (await request("/sessions/join", "POST")).body;
  const before = session.getSnapshot();

  clock.elapsedMilliseconds = 3000;
  assert.equal((await request("/sessions/test/heartbeat", "POST", a.participantToken)).status, 200);
  assert.deepEqual(session.getSnapshot(), before);

  clock.elapsedMilliseconds = 10000;
  const expired = await request("/sessions/test/heartbeat", "POST", b.participantToken);
  assert.equal(expired.status, 403);
  assert.equal(expired.body.code, "INVALID_PARTICIPANT");
  const snapshot = await request("/sessions/test", "GET", a.participantToken);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.snapshot.phase, "Waiting");
  assert.equal(snapshot.body.snapshot.players.length, 1);
  const replacement = await request("/sessions/join", "POST");
  assert.equal(replacement.status, 201);
  assert.equal(replacement.body.player.role, "B");
});

test("공통 HTTP 처리 후에도 준비 보고와 조회의 기존 응답은 유지된다", async t => {
  const { request } = await createFixture(t);
  const a = (await request("/sessions/join", "POST")).body;
  const b = (await request("/sessions/join", "POST")).body;
  assert.equal((await request("/sessions/test/ready", "POST")).status, 400);
  assert.equal((await request("/sessions/test/ready", "POST", "invalid")).status, 403);
  assert.equal((await request("/sessions/missing", "GET", a.participantToken)).status, 404);
  assert.equal((await request("/sessions/test/ready", "POST", a.participantToken)).body.snapshot.phase, "Loading");
  assert.equal((await request("/sessions/test/ready", "POST", b.participantToken)).body.snapshot.phase, "Playing");
  const snapshot = await request("/sessions/test", "GET", a.participantToken);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body.snapshot.phase, "Playing");
  assert.equal(snapshot.headers.get("cache-control"), "no-store");
  assert.equal(JSON.stringify(snapshot.body).includes(a.participantToken), false);
});

test("정상 퇴장은 인증된 참가자의 자리만 즉시 비우고 이전 토큰을 폐기한다", async t => {
  const { request } = await createFixture(t);
  const a = (await request("/sessions/join", "POST")).body;
  const b = (await request("/sessions/join", "POST")).body;
  assert.equal((await request("/sessions/test/leave", "POST")).status, 400);
  assert.equal((await request("/sessions/test/leave", "POST", "invalid")).status, 403);
  assert.equal((await request("/sessions/missing/leave", "POST", a.participantToken)).status, 404);
  const left = await request("/sessions/test/leave", "POST", a.participantToken);
  assert.equal(left.status, 200);
  assert.deepEqual(left.body, { success: true });
  assert.equal((await request("/sessions/test", "GET", a.participantToken)).status, 403);
  const remaining = await request("/sessions/test", "GET", b.participantToken);
  assert.equal(remaining.body.snapshot.phase, "Waiting");
  assert.equal(remaining.body.snapshot.players.length, 1);
  const next = (await request("/sessions/join", "POST")).body;
  assert.equal(next.player.role, "A");
  assert.equal((await request("/sessions/test/leave", "POST", a.participantToken)).status, 403);
  assert.equal((await request("/sessions/test", "GET", next.participantToken)).body.snapshot.players.length, 2);
});
