const { test } = require("node:test");
const assert = require("node:assert/strict");
const { QuerySessionResponse } = require("../dist/generated/escape/v1/session");
const { SessionErrorCode } = require("../dist/generated/escape/v1/common");

test("조회 실패의 필드 번호와 오류 코드 숫자는 계약 바이트와 일치한다", () => {
  const failure = { outcome: { $case: "failure", failure: { code: SessionErrorCode.INVALID_PARTICIPANT } } };
  // outcome.failure = field 2, SessionFailure.code = field 1, INVALID_PARTICIPANT = 3
  const contractBytes = Uint8Array.from([0x12, 0x02, 0x08, 0x03]);
  assert.deepEqual(QuerySessionResponse.encode(failure).finish(), contractBytes);
  assert.deepEqual(QuerySessionResponse.decode(contractBytes), failure);
});

test("미지정 oneof와 미지정 오류 값은 서로 다른 메시지로 유지된다", () => {
  assert.equal(QuerySessionResponse.decode(new Uint8Array()).outcome, undefined);
  assert.deepEqual(QuerySessionResponse.decode(Uint8Array.from([0x12, 0x00])), {
    outcome: { $case: "failure", failure: { code: SessionErrorCode.SESSION_ERROR_CODE_UNSPECIFIED } }
  });
});

test("알 수 없는 enum 값은 보존하고 잘린 메시지는 거부한다", () => {
  const message = { outcome: { $case: "failure", failure: { code: 999 } } };
  assert.deepEqual(QuerySessionResponse.decode(QuerySessionResponse.encode(message).finish()), message);
  assert.throws(() => QuerySessionResponse.decode(Uint8Array.from([0x0a, 0x05, 0x01])));
});
