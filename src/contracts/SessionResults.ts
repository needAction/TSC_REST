import type { Player, SessionSnapshot } from "../models/GameSession";

// 세션 처리 결과입니다. HTTP 상태 코드와 요청 헤더 검증은 포함하지 않습니다.
export const SessionErrorCodes = {
  SessionFull: "SESSION_FULL",
  SessionNotFound: "SESSION_NOT_FOUND",
  InvalidParticipant: "INVALID_PARTICIPANT"
} as const;

export type SessionErrorCode =
  typeof SessionErrorCodes[keyof typeof SessionErrorCodes];

export type JoinResult =
  | {
      success: true;
      sessionId: string;
      player: Player;
      participantToken: string;
    }
  | {
      success: false;
      code: typeof SessionErrorCodes.SessionFull;
    };

// ready는 씬 로딩 완료 보고입니다.
export type ReadyResult =
  | { success: true; snapshot: SessionSnapshot }
  | {
      success: false;
      code:
        | typeof SessionErrorCodes.SessionNotFound
        | typeof SessionErrorCodes.InvalidParticipant;
    };

// 참가자 인증 후 반환하는 읽기 전용 세션 조회 결과입니다.
export type QueryResult =
  | { success: true; snapshot: SessionSnapshot }
  | {
      success: false;
      code:
        | typeof SessionErrorCodes.SessionNotFound
        | typeof SessionErrorCodes.InvalidParticipant;
    };
