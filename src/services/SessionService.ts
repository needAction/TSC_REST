import { randomUUID } from "node:crypto";
import { GameSession, Player } from "../models/GameSession";

export type JoinResult =
  | {
      success: true;
      sessionId: string;
      player: Player;
      participantToken: string;
    }
  | {
      success: false;
      code: "SESSION_FULL";
    };

export class SessionService {
  private readonly participants = new Map<string, string>();

  constructor(private readonly session: GameSession) {}

  join(): JoinResult {
    const player = this.session.addPlayer(randomUUID());

    if (player === undefined) {
      return {
        success: false,
        code: "SESSION_FULL"
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

  ready(sessionId: string, participantToken: string) {
    if(sessionId !== this.session.id) {
      return {
        success : false as const,
        code:"SESSION_NOT_FOUND" as const
      };
    }

    const playerId = this.participants.get(participantToken);

    if(playerId === undefined || !this.session.markReady(playerId)) {
      return {
        success: false as const,
        code: "INVALID_PARTICIPANT" as const
      };
    }

    return {
      success: true as const,
      snapshot: this.session.getSnapshot()
    };
  }
}
