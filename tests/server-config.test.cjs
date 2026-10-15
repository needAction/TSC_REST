const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadServerConfig } = require("../dist/config/ServerConfig");

test("생존 확인 설정은 정수 ms 기본값과 환경변수를 사용한다", () => {
  assert.deepEqual(loadServerConfig({}), {
    host: "0.0.0.0", port: 3000,
    participantTimeoutMs: 10000, expirationCheckIntervalMs: 500
  });
  const config = loadServerConfig({
    PARTICIPANT_TIMEOUT_MS: "25000", EXPIRATION_CHECK_INTERVAL_MS: "1000"
  });
  assert.equal(config.participantTimeoutMs, 25000);
  assert.equal(config.expirationCheckIntervalMs, 1000);
});

test("시간 설정의 누락은 기본값을 쓰고 잘못된 값은 거부한다", () => {
  for (const key of ["PARTICIPANT_TIMEOUT_MS", "EXPIRATION_CHECK_INTERVAL_MS"]) {
    for (const value of ["", "0", "-1", "0.5", "NaN", "Infinity", "1e3", "9007199254740992"]) {
      assert.throws(() => loadServerConfig({ [key]: value }), new RegExp(key));
    }
  }
  assert.throws(() => loadServerConfig({
    PARTICIPANT_TIMEOUT_MS: "3000000000", EXPIRATION_CHECK_INTERVAL_MS: "2147483648"
  }), /EXPIRATION_CHECK_INTERVAL_MS/);
});

test("만료 검사 간격은 참가자 만료 시간을 넘을 수 없다", () => {
  assert.throws(() => loadServerConfig({
    PARTICIPANT_TIMEOUT_MS: "100", EXPIRATION_CHECK_INTERVAL_MS: "500"
  }), /PARTICIPANT_TIMEOUT_MS/);
  assert.equal(loadServerConfig({
    PARTICIPANT_TIMEOUT_MS: "500", EXPIRATION_CHECK_INTERVAL_MS: "500"
  }).expirationCheckIntervalMs, 500);
});
