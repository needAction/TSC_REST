import { isIP } from "node:net";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly participantTimeoutMs: number;
  readonly expirationCheckIntervalMs: number;
}

function readPositiveInteger(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const text = environment[key] ?? String(fallback);
  const value = Number(text);

  if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${key}는 1~${maximum} 범위의 정수여야 합니다.`);
  }

  return value;
}

// 프로세스 환경은 실행 경계에서 읽고, 검증된 설정만 서버에 전달합니다.
export function loadServerConfig(
  environment: Readonly<Record<string, string | undefined>>
): ServerConfig {
  const host = environment.HOST ?? "0.0.0.0";

  if (isIP(host) === 0) {
    throw new Error("HOST는 유효한 IPv4 또는 IPv6 주소여야 합니다.");
  }

  const port = readPositiveInteger(environment, "PORT", 3000, 65535);
  const participantTimeoutMs = readPositiveInteger(environment, "PARTICIPANT_TIMEOUT_MS", 10000);
  const expirationCheckIntervalMs = readPositiveInteger(environment, "EXPIRATION_CHECK_INTERVAL_MS", 500, 2147483647);

  if (expirationCheckIntervalMs > participantTimeoutMs) {
    throw new Error("EXPIRATION_CHECK_INTERVAL_MS는 PARTICIPANT_TIMEOUT_MS 이하여야 합니다.");
  }

  return { host, port, participantTimeoutMs, expirationCheckIntervalMs };
}
