import type { CsvGameData } from "../data/tables/CsvGameData";
import { createGameDataBundle, GameDataBundle } from "../data/GameDataBundle";
import { RoomProgression } from "../models/RoomProgression";
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
  private readonly bundle?: GameDataBundle;
  private readonly progression?: RoomProgression;
  constructor(
    private readonly session: GameSession,
    private readonly participants: ParticipantRegistry,
    gameData?: CsvGameData
  ) {
    if (gameData) {
      this.bundle = createGameDataBundle(gameData.source);
      this.progression = new RoomProgression(gameData);
    }
  }

  join(): JoinResult {
    // 빈자리가 없다고 판단하기 전에 만료된 자리를 정리합니다.
    this.expireParticipants();

    if (this.session.getSnapshot().players.length === 0) this.progression?.reset();

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
      snapshot: this.getSnapshot()
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
      snapshot: this.getSnapshot()
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

  private getSnapshot() {
    const snapshot = this.session.getSnapshot();
    return this.progression ? { ...snapshot, unlockedRoomIds: this.progression.unlockedRoomIds } : snapshot;
  }

  data(sessionId: string, token: string) {
    const participant = this.validateParticipant(sessionId, token);
    if (!participant.success) return participant;
    if (!this.bundle) throw new Error("Game data is not initialized.");
    return { success: true as const, ...this.bundle };
  }

  submit(sessionId: string, token: string, puzzleId: number, answers: readonly string[]) {
    const participant = this.validateParticipant(sessionId, token);
    if (!participant.success) return participant;
    const player = this.session.getSnapshot().players.find(row => row.id === participant.playerId)!;
    const result = this.session.phase === "Playing" && this.progression
      ? this.progression.submit(player.role, puzzleId, answers) : { accepted: false, correct: false };
    return { success: true as const, ...result, snapshot: this.getSnapshot() };
  }

  decideRoom(sessionId: string, token: string, roomNo: number, answers?: readonly string[]) {
    const participant = this.validateParticipant(sessionId, token);
    if (!participant.success) return participant;
    const progression = this.progression;
    if (!progression) throw new Error("Game data is not initialized.");
    const role = this.session.getSnapshot().players.find(player => player.id === participant.playerId)!.role;
    const room = progression.findRoom(role, roomNo);
    if (!room) return { success: false as const, code: SessionErrorCodes.RoomNotFound };
    if (this.session.phase !== "Playing") return { success: false as const, code: SessionErrorCodes.GameNotPlaying };
    let value: boolean;
    if (answers !== undefined) {
      const submitted = progression.submit(role, room.puzzleId, answers);
      if (!submitted.accepted) return { success: false as const, code: SessionErrorCodes.SubmissionNotAllowed };
      value = submitted.correct;
    } else value = progression.checkDoor(role, roomNo);
    return { success: true as const, roomNo, value, doorAllowed: progression.isDoorPermitted(role, roomNo), snapshot: this.getSnapshot() };
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
