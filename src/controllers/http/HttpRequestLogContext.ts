import type { ServerResponse } from "node:http";
import type { GameApiResponse } from "../../generated/escape/v1/game_api";
import { SessionErrorCode } from "../../generated/escape/v1/common";
import { PlayerRole, SessionPhase } from "../../generated/escape/v1/session";

export interface AccessLogParticipant {
  readonly sessionId: string;
  readonly playerId: string;
  readonly role: "A" | "B";
}

export interface RequestLogDetails {
  operation: string;
  route: string;
  sessionId?: string;
  playerId?: string;
  role?: "A" | "B";
  roomNo?: number;
  puzzleId?: number;
  answerCount?: number;
  outcome?: string;
  result?: "success" | "correct" | "incorrect" | "allowed" | "locked" | "rejected" | "failure";
  failureCode?: string;
  correct?: boolean;
  accepted?: boolean;
  doorAllowed?: boolean;
  phase?: string;
  participantCount?: number;
  unlockedRoomIds?: number[];
}

// 응답 객체에 요청별 진단 상태를 연결합니다. 토큰·답 문자열·원본 본문은 보관하지 않습니다.
// HTTP 밖의 도메인 모델은 이 Context를 참조하지 않습니다.
export class HttpRequestLogContext {
  private static readonly contexts = new WeakMap<ServerResponse, HttpRequestLogContext>();
  private readonly details: RequestLogDetails = { operation: "Unknown", route: "<unmatched>" };

  static attach(response: ServerResponse): HttpRequestLogContext {
    const context = new HttpRequestLogContext();
    this.contexts.set(response, context);
    return context;
  }
  static find(response: ServerResponse): HttpRequestLogContext | undefined { return this.contexts.get(response); }
  static release(response: ServerResponse): void { this.contexts.delete(response); }

  setRoute(operation: string, route: string): void {
    this.details.operation = operation;
    this.details.route = route;
  }
  setParticipant(participant: AccessLogParticipant): void {
    this.details.sessionId = participant.sessionId;
    this.details.playerId = participant.playerId;
    this.details.role = participant.role;
  }
  setRoomCommand(roomNo: number, answerCount: number): void {
    if (Number.isInteger(roomNo) && roomNo > 0) this.details.roomNo = roomNo;
    this.details.answerCount = answerCount;
  }
  setPuzzleCommand(puzzleId: number, answerCount: number): void {
    this.details.puzzleId = puzzleId;
    this.details.answerCount = answerCount;
  }

  // 이미 만들어진 응답에서 필요한 값만 명시적으로 선택합니다. Protobuf를 다시 해석하지 않습니다.
  captureReply(body: GameApiResponse): void {
    const outcome = body.outcome;
    if (!outcome) return;
    this.details.outcome = outcome.$case;
    this.details.result = "success";
    if (outcome.$case === "failure") {
      this.details.result = "failure";
      this.details.failureCode = SessionErrorCode[outcome.failure.code] ?? "UNKNOWN";
      return;
    }
    if (outcome.$case === "joined") {
      const reply = outcome.joined;
      this.details.sessionId = reply.sessionId;
      if (reply.player) {
        this.details.playerId = reply.player.playerId;
        this.details.role = reply.player.role === PlayerRole.ROLE_A ? "A"
          : reply.player.role === PlayerRole.ROLE_B ? "B" : undefined;
      }
    }
    if (outcome.$case === "room") {
      const reply = outcome.room;
      this.details.roomNo = reply.roomNo;
      this.details.doorAllowed = reply.doorAllowed;
      if (this.details.operation === "SubmitRoomAnswer") {
        this.details.correct = reply.value;
        this.details.result = reply.value ? "correct" : "incorrect";
      } else this.details.result = reply.value ? "allowed" : "locked";
    }
    if (outcome.$case === "puzzle") {
      this.details.accepted = outcome.puzzle.accepted;
      this.details.correct = outcome.puzzle.correct;
      this.details.result = !outcome.puzzle.accepted ? "rejected" : outcome.puzzle.correct ? "correct" : "incorrect";
    }
    const snapshot = outcome.$case === "snapshot" ? outcome.snapshot
      : outcome.$case === "room" ? outcome.room.snapshot
      : outcome.$case === "puzzle" ? outcome.puzzle.snapshot : undefined;
    if (snapshot) {
      this.details.sessionId = snapshot.sessionId;
      this.details.phase = SessionPhase[snapshot.phase];
      this.details.participantCount = snapshot.players.length;
      this.details.unlockedRoomIds = [...snapshot.unlockedRoomIds];
    }
  }
  snapshot(): RequestLogDetails {
    return { ...this.details, ...(this.details.unlockedRoomIds ? { unlockedRoomIds: [...this.details.unlockedRoomIds] } : {}) };
  }
}
