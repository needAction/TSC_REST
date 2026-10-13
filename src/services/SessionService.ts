import { randomUUID } from "node:crypto";
import { GameSession } from "../models/GameSession";
import { SessionErrorCodes } from "../contracts/SessionResults";
import type { JoinResult, ReadyResult, QueryResult } from "../contracts/SessionResults";

export class SessionService {
  private readonly participants = new Map<string, string>();

  constructor(private readonly session: GameSession) {}

  join(): JoinResult {
    const player = this.session.addPlayer(randomUUID());

    if (player === undefined) {
      return {
        success: false,
        code: SessionErrorCodes.SessionFull
      };
    }

    const participantToken = randomUUID();
    this.participants.set(participantToken, player.id);

    return {
      success: true,
      sessionId: this.session.id,
      player,
      participantToken
    };
  }

  // HTTP ready 요청은 인증된 참가자의 플레이용 씬 로딩 완료 보고입니다.
  ready(sessionId: string, participantToken: string): ReadyResult {
    if (sessionId !== this.session.id) {
      return {
        success: false,
        code: SessionErrorCodes.SessionNotFound
      };
    }

    const playerId = this.participants.get(participantToken);

    if (playerId === undefined || !this.session.markSceneLoaded(playerId)) {
      return {
        success: false,
        code: SessionErrorCodes.InvalidParticipant
      };
    }

    return {
      success: true,
      snapshot: this.session.getSnapshot()
    };
  }

  // 조회는 로딩 완료 상태를 변경하지 않습니다.
  query(sessionId: string, participantToken: string): QueryResult {
    if (sessionId !== this.session.id) {
      return { success: false, code: SessionErrorCodes.SessionNotFound };
    }

    if (!this.participants.has(participantToken)) {
      return { success: false, code: SessionErrorCodes.InvalidParticipant };
    }

    return { success: true, snapshot: this.session.getSnapshot() };
  }
}
