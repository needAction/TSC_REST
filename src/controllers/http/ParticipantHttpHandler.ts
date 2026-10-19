import type { IncomingMessage, ServerResponse } from "node:http";
import { ProtobufHttp, type ReplyKind } from "./ProtobufHttp";
import { SessionErrorCode } from "../../generated/escape/v1/common";

type ParticipantHttpResult = { success: true } | { success: false; code: string };

// HTTP 인증 헤더와 응답 형식은 이 경계에서만 처리합니다.
export class ParticipantHttpHandler {
  static handle(
    request: IncomingMessage,
    response: ServerResponse,
    operation: (participantToken: string) => ParticipantHttpResult,
    kind: ReplyKind = "snapshot"
  ): void {

    const token = request.headers["x-participant-token"];
    if (typeof token !== "string" || token.trim().length === 0) {
      ProtobufHttp.failure(response, SessionErrorCode.PARTICIPANT_TOKEN_REQUIRED);
      return;
    }

    const result = operation(token);
    ProtobufHttp.result(response, result, kind);
  }
}
