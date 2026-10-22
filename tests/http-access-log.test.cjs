const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const { loadGameData } = require('../dist/infrastructure/data/loadGameData');
const { GameSession } = require('../dist/models/GameSession');
const { ParticipantRegistry } = require('../dist/services/ParticipantRegistry');
const { SessionService } = require('../dist/services/SessionService');
const { SessionController } = require('../dist/controllers/SessionController');
const { createSessionHttpServer } = require('../dist/infrastructure/http/createSessionHttpServer');
const { HttpAccessLogger } = require('../dist/infrastructure/http/HttpAccessLogger');
const { ProtobufHttp } = require('../dist/controllers/http/ProtobufHttp');
const { GameApiResponse, RoomCommandRequest, PuzzleCommandRequest } = require('../dist/generated/escape/v1/game_api');
const { SessionErrorCode } = require('../dist/generated/escape/v1/common');
const dataPromise = loadGameData(path.resolve(__dirname, '../data'));

async function fixture(t, sink) {
  const entries = [], clock = { elapsedMilliseconds: 0 }, data = await dataPromise;
  const session = new GameSession({ id: 'access-test', roles: ['A', 'B'] });
  const participants = new ParticipantRegistry(clock, 10000);
  const service = new SessionService(session, participants, data);
  const logger = new HttpAccessLogger(sink ?? { write: entry => entries.push(entry) }, token => {
    const playerId = participants.getPlayerId(token);
    const player = session.getSnapshot().players.find(row => row.id === playerId);
    return player ? { sessionId: session.id, playerId, role: player.role } : undefined;
  }, clock);
  const server = createSessionHttpServer(new SessionController(service), logger);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, token, body, headers = {}, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base + route, {
      method,
      headers: { ...(token ? { 'x-participant-token': token } : {}), ...(body !== undefined ? { 'content-type': 'application/protobuf' } : {}), ...headers },
      body, signal: AbortSignal.timeout(5000)
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    await new Promise(setImmediate);
    const reply = route.startsWith('/health') || route === '/openapi.json' ? null : GameApiResponse.decode(bytes).outcome;
    const entry = entries.find(item => item.requestId === response.headers.get('x-request-id'));
    return { response, reply, entry };
  }
  const join = async () => (await request('/sessions/join', null, new Uint8Array())).reply.joined;
  const room = (token, roomNo, answers) => request('/sessions/access-test/rooms/' + (answers === undefined ? 'door' : 'answer'), token,
    RoomCommandRequest.encode({ roomNo, answers: answers ?? [] }).finish());
  return { entries, data, clock, server, base, request, join, room };
}

test('접근 로그는 입장 성공·정원 초과와 참가 역할을 요청당 한 번 기록한다', async t => {
  const f = await fixture(t);
  const a = await f.join(), b = await f.join();
  const full = await f.request('/sessions/join', null, new Uint8Array());
  assert.equal(f.entries.length, 3);
  assert.deepEqual(f.entries.slice(0, 2).map(e => [e.operation, e.statusCode, e.role, e.result]),
    [['JoinSession', 201, 'A', 'success'], ['JoinSession', 201, 'B', 'success']]);
  assert.equal(f.entries[0].playerId, a.player.playerId);
  assert.equal(f.entries[1].playerId, b.player.playerId);
  assert.equal(full.entry.failureCode, 'SESSION_FULL');
  assert.equal(full.entry.result, 'failure');
  assert.equal(full.entry.statusCode, 409);
  for (const entry of f.entries) {
    assert.equal(entry.completion, 'finished');
    assert.equal(entry.event, 'http_access');
    assert.ok(Number.isSafeInteger(entry.durationMs) && entry.durationMs >= 0);
    assert.ok(Number.isFinite(Date.parse(entry.timestamp)));
  }
  assert.equal(new Set(f.entries.map(e => e.requestId)).size, 3);
  assert.equal(JSON.stringify(f.entries).includes(a.participantToken), false);
});

test('정답·오답·잠긴 문·허가된 문을 HTTP 성공과 구분하고 방 해금 결과를 기록한다', async t => {
  const f = await fixture(t), a = await f.join(), b = await f.join();
  for (const player of [a, b]) await f.request('/sessions/access-test/ready', player.participantToken, new Uint8Array());
  const locked = await f.room(a.participantToken, 1);
  assert.equal(locked.entry.result, 'locked'); assert.equal(locked.entry.doorAllowed, false);
  const wrong = await f.room(b.participantToken, 1, ['secret-wrong-value']);
  assert.equal(wrong.entry.statusCode, 200); assert.equal(wrong.entry.result, 'incorrect');
  assert.equal(wrong.entry.correct, false); assert.equal(wrong.entry.answerCount, 1);
  const answers = f.data.puzzleSlots.filter(row => row.puzzleId === 5001).sort((x, y) => x.slot - y.slot).map(row => row.answer);
  const correct = await f.room(b.participantToken, 1, answers);
  assert.equal(correct.entry.result, 'correct'); assert.equal(correct.entry.correct, true);
  assert.equal(correct.entry.role, 'B'); assert.equal(correct.entry.roomNo, 1);
  assert.equal(correct.entry.doorAllowed, true); assert.equal(correct.entry.phase, 'PLAYING');
  assert.deepEqual(correct.entry.unlockedRoomIds, [1001, 1002, 1004]);
  const allowed = await f.room(a.participantToken, 1);
  assert.equal(allowed.entry.result, 'allowed'); assert.equal(allowed.entry.role, 'A');
  assert.deepEqual(allowed.entry.unlockedRoomIds, [1001, 1002, 1003, 1004]);
  assert.equal(JSON.stringify(f.entries).includes('secret-wrong-value'), false);
  assert.equal(JSON.stringify(f.entries).includes(b.participantToken), false);
});

test('인증·Protobuf·요청 크기 실패를 기록하며 쿼리·헤더·본문의 비밀값은 기록하지 않는다', async t => {
  const f = await fixture(t), a = await f.join();
  const token = 'private-forged-token', secret = 'private-query-secret';
  const invalid = await f.request('/sessions/access-test/rooms/door?token=' + secret, token,
    RoomCommandRequest.encode({ roomNo: 4, answers: [] }).finish(), { authorization: 'Bearer hidden-authorization' });
  assert.equal(invalid.entry.failureCode, 'INVALID_PARTICIPANT'); assert.equal(invalid.entry.roomNo, 4);
  assert.equal(invalid.entry.route, '/sessions/{sessionId}/rooms/door');
  assert.equal(invalid.entry.role, undefined);
  const missing = await f.room(null, 1);
  assert.equal(missing.entry.failureCode, 'PARTICIPANT_TOKEN_REQUIRED');
  const malformed = await f.request('/sessions/access-test/rooms/answer', a.participantToken, Uint8Array.from([18, 5, 1]));
  assert.equal(malformed.entry.failureCode, 'INVALID_REQUEST');
  const oversized = await f.request('/sessions/access-test/rooms/answer', a.participantToken, new Uint8Array(8193));
  assert.equal(oversized.entry.statusCode, 413); assert.equal(oversized.entry.failureCode, 'PAYLOAD_TOO_LARGE');
  const json = await f.request('/sessions/access-test/rooms/answer', a.participantToken, Buffer.from('{"answers":["hidden-body"]}'), { 'content-type': 'application/json' });
  assert.equal(json.entry.statusCode, 415);
  const unknown = await f.request('/hidden-unknown-path?secret=' + secret);
  assert.equal(unknown.entry.route, '<unmatched>'); assert.equal(unknown.entry.failureCode, 'ROUTE_NOT_FOUND');
  const serialized = JSON.stringify(f.entries);
  for (const hidden of [token, secret, 'hidden-authorization', 'hidden-body', 'hidden-unknown-path', a.participantToken])
    assert.equal(serialized.includes(hidden), false);
});

test('조회·데이터·ready·heartbeat·leave·운영 경로도 기록하며 leave 참가자 정보가 유지된다', async t => {
  const f = await fixture(t), a = await f.join();
  await f.request('/sessions/access-test', a.participantToken);
  const data = await f.request('/sessions/access-test/data', a.participantToken);
  await f.request('/sessions/access-test/ready', a.participantToken, new Uint8Array());
  await f.request('/sessions/access-test/heartbeat', a.participantToken, new Uint8Array());
  const leave = await f.request('/sessions/access-test/leave', a.participantToken, new Uint8Array());
  assert.equal(leave.entry.role, 'A'); assert.equal(leave.entry.playerId, a.player.playerId);
  assert.equal(data.entry.outcome, 'data'); assert.equal(data.entry.tables, undefined);
  await f.request('/health'); await f.request('/openapi.json');
  assert.deepEqual(f.entries.map(e => e.operation), ['JoinSession', 'QuerySession', 'DownloadData', 'ReportSceneLoaded', 'Heartbeat', 'LeaveSession', 'Health', 'OpenApi']);
  assert.equal(f.entries.length, 8);
});

test('기존 puzzleId 제출 경로도 결과와 ID를 기록한다', async t => {
  const f = await fixture(t), a = await f.join(), b = await f.join();
  for (const player of [a, b]) await f.request('/sessions/access-test/ready', player.participantToken, new Uint8Array());
  const response = await f.request('/sessions/access-test/puzzles/5001/submit', b.participantToken,
    PuzzleCommandRequest.encode({ answers: ['not-the-answer'] }).finish());
  assert.equal(response.entry.puzzleId, 5001); assert.equal(response.entry.accepted, true);
  assert.equal(response.entry.result, 'incorrect'); assert.equal(response.entry.answerCount, 1);
});

test('응답 전 클라이언트 연결 종료는 완료 로그와 중복되지 않고 aborted로 남는다', async t => {
  const f = await fixture(t);
  const recorded = new Promise(resolve => f.server.once('request', (_request, response) => response.once('close', resolve)));
  const client = http.request(f.base + '/sessions/access-test/rooms/answer', { method: 'POST', headers: {
    'content-type': 'application/protobuf', 'content-length': '100'
  } });
  client.on('error', () => {});
  client.write(Buffer.from([8, 1])); // 본문을 완성하지 않은 채 연결을 중단합니다.
  await once(f.server, 'request');
  f.clock.elapsedMilliseconds = 37;
  client.destroy();
  await recorded; await new Promise(setImmediate);
  assert.equal(f.entries.length, 1);
  assert.equal(f.entries[0].completion, 'aborted'); assert.equal(f.entries[0].result, 'aborted');
  assert.equal(f.entries[0].statusCode, null); assert.equal(f.entries[0].durationMs, 37);
});

test('로그 출력이나 참가자 식별 실패가 실제 HTTP 응답을 실패시키지 않는다', async t => {
  const f = await fixture(t, { write() { throw new Error('sink failed'); } });
  const joined = await f.join(); assert.equal(joined.player.role, 1);
  const response = await f.request('/health'); assert.equal(response.response.status, 200);
  const logger = new HttpAccessLogger({ write() {} }, () => { throw new Error('identify failed'); });
  const server = createSessionHttpServer({ join(response) { ProtobufHttp.failure(response, SessionErrorCode.SESSION_FULL); } }, logger);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const result = await fetch(`http://127.0.0.1:${server.address().port}/sessions/join`, { method: 'POST', headers: { 'x-participant-token': 'hidden' } });
  assert.equal(result.status, 409); await result.arrayBuffer();
});
