import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IMillisecondClock } from "../../common/IMillisecondClock";
import { MonotonicMillisecondClock } from "../../common/MonotonicMillisecondClock";
import { HttpRequestLogContext } from "../../controllers/http/HttpRequestLogContext";
import type { AccessLogParticipant, RequestLogDetails } from "../../controllers/http/HttpRequestLogContext";
import type { DiagnosticLogEntry, ILogSink } from "../../common/logging/ILogSink";
import { ConsoleJsonLogSink } from "../logging/ConsoleJsonLogSink";

export interface HttpAccessLogEntry extends Omit<RequestLogDetails, "result">, DiagnosticLogEntry {
  readonly event: "http_access";
  readonly message: string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly method: string;
  readonly statusCode: number | null;
  readonly durationMs: number;
  readonly completion: "finished" | "aborted";
  readonly result: NonNullable<RequestLogDetails["result"]> | "aborted";
}

// 응답 완료 이벤트를 관찰하는 요청별 로거. 게임 판정이나 HTTP 응답 내용을 바꾸지 않습니다.
export class HttpAccessLogger {
  constructor(
    private readonly sink: ILogSink<HttpAccessLogEntry> = new ConsoleJsonLogSink(),
    private readonly identify?: (token: string) => AccessLogParticipant | undefined,
    private readonly clock: IMillisecondClock = new MonotonicMillisecondClock()
  ) {}

  observe(request: IncomingMessage, response: ServerResponse): HttpRequestLogContext {
    const context = HttpRequestLogContext.attach(response);
    const requestId = randomUUID();
    const startedMs = this.clock.elapsedMilliseconds;
    response.setHeader("X-Request-Id", requestId);
    // 원본 토큰은 식별 함수에만 전달하고 Context나 로그에는 저장하지 않습니다.
    const token = request.headers["x-participant-token"];
    if (typeof token === "string" && this.identify) {
      try {
        const participant = this.identify(token);
        if (participant) context.setParticipant(participant);
      } catch { /* 진단용 조회 실패가 게임 요청을 중단하지 않게 합니다. */ }
    }
    let recorded = false;
    const record = (completion: "finished" | "aborted") => {
      if (recorded) return;
      recorded = true;
      response.removeListener("finish", finished);
      response.removeListener("close", closed);
      HttpRequestLogContext.release(response);
      const details = context.snapshot();
      const entry: HttpAccessLogEntry = {
        ...details,
        event: "http_access",
        message: completion === "finished" ? "HTTP 요청 처리 완료" : "HTTP 응답 완료 전 연결 종료",
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method ?? "UNKNOWN",
        statusCode: response.headersSent ? response.statusCode : null,
        durationMs: Math.max(0, this.clock.elapsedMilliseconds - startedMs),
        completion,
        result: completion === "aborted" ? "aborted" : details.result ?? (response.statusCode >= 400 ? "failure" : "success")
      };
      try { this.sink.write(entry); } catch { /* 로그 출력 오류가 완료된 요청/서버를 중단하지 않게 합니다. */ }
    };
    const finished = () => record("finished");
    const closed = () => record(response.writableFinished ? "finished" : "aborted");
    response.once("finish", finished);
    response.once("close", closed);
    return context;
  }
}
