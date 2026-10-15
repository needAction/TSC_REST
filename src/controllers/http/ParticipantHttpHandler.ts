import type { IncomingMessage, ServerResponse } from "node:http";
import { SessionErrorCodes } from "../../contracts/SessionResults";
import type { SessionParticipantFailure } from "../../contracts/SessionResults";

type ParticipantHttpResult = { success: true } | SessionParticipantFailure;

// HTTP 인증 헤더와 응답 형식은 이 경계에서만 처리합니다.
export class ParticipantHttpHandler {
  static handle(
    request: IncomingMessage,
    response: ServerResponse,
    operation: (participantToken: string) => ParticipantHttpResult
  ): void {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");

    const token = request.headers["x-participant-token"];
    if (typeof token !== "string" || token.trim().length === 0) {
      response.writeHead(400);
      response.end(JSON.stringify({
        success: false,
        code: "PARTICIPANT_TOKEN_REQUIRED"
      }));
      return;
    }

    const result = operation(token);
    const status = result.success ? 200
      : result.code === SessionErrorCodes.SessionNotFound ? 404 : 403;

    response.writeHead(status);
    response.end(JSON.stringify(result));
  }
}
