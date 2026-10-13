import { isIP } from "node:net";

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
}

// 프로세스 환경은 실행 경계에서 읽고, 검증된 설정만 서버에 전달합니다.
export function loadServerConfig(
  environment: Readonly<Record<string, string | undefined>>
): ServerConfig {
  const host = environment.HOST ?? "0.0.0.0";
  const portText = environment.PORT ?? "3000";

  if (isIP(host) === 0) {
    throw new Error("HOST는 유효한 IPv4 또는 IPv6 주소여야 합니다.");
  }

  if (!/^[0-9]+$/.test(portText)) {
    throw new Error("PORT는 1~65535 범위의 정수여야 합니다.");
  }

  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT는 1~65535 범위의 정수여야 합니다.");
  }

  return { host, port };
}
