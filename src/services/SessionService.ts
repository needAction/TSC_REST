import { randomUUID } from "node:crypto";
import { GameSession } from "../models/GameSession";
import { ParticipantRegistry } from "./ParticipantRegistry";
import { SessionErrorCodes } from "../contracts/SessionResults";

import type {
  JoinResult,
  ReadyResult,
  QueryResult,
  HeartbeatResult,
  LeaveResult,
  SessionParticipantFailure
} from "../contracts/SessionResults";

type ParticipantValidationResult =
  | { success: true; playerId: string }
  | SessionParticipantFailure;

export class SessionService {
  constructor(
    private readonly session: GameSession,
    private readonly participants: ParticipantRegistry
  ) {}

  join(): JoinResult {
    // 빈자리가 없다고 판단하기 전에 만료된 자리를 정리합니다.
    this.expireParticipants();

    const player = this.session.addPlayer(randomUUID());

    if (player === undefined) {
      return {
        success: false,
        code: SessionErrorCodes.SessionFull
      };
    }

    const participantToken = randomUUID();

    try {
      this.participants.register(participantToken, player.id);
    } catch (error) {
      // 등록 실패 시 게임 자리만 남지 않도록 되돌립니다.
      this.session.removePlayer(player.id);
      throw error;
    }

    return {
      success: true,
      sessionId: this.session.id,
      player,
      participantToken
    };
  }

  ready(sessionId: string, participantToken: string): ReadyResult {
    const participant = this.validateParticipant(
      sessionId,
      participantToken
    );

    if (!participant.success) {
      return participant;
    }

    if (!this.session.markSceneLoaded(participant.playerId)) {
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

  query(sessionId: string, participantToken: string): QueryResult {
    const participant = this.validateParticipant(
      sessionId,
      participantToken
    );

    if (!participant.success) {
      return participant;
    }

    return {
      success: true,
      snapshot: this.session.getSnapshot()
    };
  }

  heartbeat(
    sessionId: string,
    participantToken: string
  ): HeartbeatResult {
    const participant = this.validateParticipant(
      sessionId,
      participantToken
    );

    if (!participant.success) {
      return participant;
    }

    if (!this.participants.heartbeat(participantToken)) {
      // 검증 직후 만료 경계를 넘은 경우도 갱신하지 않습니다.
      this.removeParticipant(participantToken);

      return {
        success: false,
        code: SessionErrorCodes.InvalidParticipant
      };
    }

    return { success: true };
  }

  leave(sessionId: string, participantToken: string): LeaveResult {
    const participant = this.validateParticipant(sessionId, participantToken);
    if (!participant.success) return participant;
    this.removeParticipant(participantToken);
    return { success: true };
  }

  expireParticipants(): number {
    let removedCount = 0;

    for (const token of this.participants.getExpiredTokens()) {
      if (this.removeParticipant(token)) {
        removedCount++;
      }
    }

    return removedCount;
  }

  private validateParticipant(
    sessionId: string,
    participantToken: string
  ): ParticipantValidationResult {
    if (sessionId !== this.session.id) {
      return {
        success: false,
        code: SessionErrorCodes.SessionNotFound
      };
    }

    this.expireParticipants();

    const playerId = this.participants.getPlayerId(
      participantToken
    );

    if (playerId === undefined) {
      return {
        success: false,
        code: SessionErrorCodes.InvalidParticipant
      };
    }

    return { success: true, playerId };
  }

  private removeParticipant(participantToken: string): boolean {
    const playerId = this.participants.remove(participantToken);

    if (playerId === undefined) {
      return false;
    }

    this.session.removePlayer(playerId);
    return true;
  }
}
