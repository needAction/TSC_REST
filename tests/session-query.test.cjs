const { test } = require("node:test");
const {decodeReply}=require("./helpers/protobuf.cjs");
const assert = require("node:assert/strict");
const { GameSession } = require("../dist/models/GameSession");
const { createSessionService } = require("./helpers/createSessionService.cjs");
const { SessionController } = require("../dist/controllers/SessionController");
test("조회는 참가자만 허용하며 로딩 상태와 토큰을 변경하지 않는다", () => {
  const session = new GameSession({ id: "test", roles: ["A", "B"] });
  const service = createSessionService(session);
  const a = service.join();
  const b = service.join();
  assert.equal(service.query("missing", a.participantToken).code, "SESSION_NOT_FOUND");
  assert.equal(service.query("test", "invalid").code, "INVALID_PARTICIPANT");
  const before = session.getSnapshot();
  assert.deepEqual(service.query("test", a.participantToken).snapshot, before);
  assert.deepEqual(session.getSnapshot(), before);
  assert.equal(service.query("test", a.participantToken).snapshot.players[0].ready, false);
  service.ready("test", a.participantToken);
  assert.equal(service.query("test", b.participantToken).snapshot.phase, "Loading");
  service.ready("test", b.participantToken);
  const result = service.query("test", a.participantToken);
  assert.equal(result.snapshot.phase, "Playing");
  assert.equal(JSON.stringify(result).includes(a.participantToken), false);
  assert.equal(JSON.stringify(result).includes(b.participantToken), false);
  result.snapshot.players[0].ready = false;
  assert.equal(service.query("test", a.participantToken).snapshot.players[0].ready, true);
});

test("조회 Controller는 오류 상태와 캐시 금지 헤더를 반환한다", () => {
  const controller = new SessionController(createSessionService(new GameSession({ id: "test", roles: ["A", "B"] })));
  
  function query(token, sessionId = "test") {
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; },
      writeHead(status) { this.status = status; },
      end(body) { this.body = decodeReply(body); }
    };
    controller.query({ headers: token === undefined ? {} : { "x-participant-token": token } }, response, sessionId);
    assert.equal(response.headers["Cache-Control"], "no-store");
    return response;
  }
  assert.equal(query().status, 400);
  assert.equal(query("").body.code, "PARTICIPANT_TOKEN_REQUIRED");
  assert.equal(query("invalid").status, 403);
  assert.equal(query("invalid", "missing").status, 404);
});
