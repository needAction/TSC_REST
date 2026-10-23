import type { IncomingMessage, ServerResponse } from "node:http";
import { GameApiResponse } from "../../generated/escape/v1/game_api";
import { SessionErrorCode } from "../../generated/escape/v1/common";
import { PlayerRole, SessionPhase } from "../../generated/escape/v1/session";
import type { Player, SessionSnapshot } from "../../models/GameSession";
import { HttpRequestLogContext } from "./HttpRequestLogContext";

export const protobufMediaType = "application/protobuf";
export type ReplyKind = "joined" | "snapshot" | "completed" | "data" | "puzzle" | "room";
type DomainReply = {
  success: boolean;
  code?: string;
  sessionId?: string;
  player?: Player;
  participantToken?: string;
  snapshot?: SessionSnapshot & { unlockedRoomIds?: readonly number[] };
  version?: string;
  tables?: readonly {
    name: string;
    csv: string
  }[];
  accepted?: boolean;
  correct?: boolean;
  roomNo?: number;
  value?: boolean;
  doorAllowed?: boolean
};
const statuses: Partial<Record<SessionErrorCode, number>> = {
  [SessionErrorCode.SESSION_FULL]: 409, [SessionErrorCode.SESSION_NOT_FOUND]: 404,
  [SessionErrorCode.INVALID_PARTICIPANT]: 403, [SessionErrorCode.PARTICIPANT_TOKEN_REQUIRED]: 400,
  [SessionErrorCode.INVALID_REQUEST]: 400, [SessionErrorCode.UNSUPPORTED_MEDIA_TYPE]: 415,
  [SessionErrorCode.PAYLOAD_TOO_LARGE]: 413, [SessionErrorCode.ROOM_NOT_FOUND]: 404,
  [SessionErrorCode.SUBMISSION_NOT_ALLOWED]: 409, [SessionErrorCode.GAME_NOT_PLAYING]: 409,
  [SessionErrorCode.INTERNAL_ERROR]: 500, [SessionErrorCode.ROUTE_NOT_FOUND]: 404
};
export class ProtobufRequestError extends Error {
  constructor(readonly code: SessionErrorCode) {
    super(SessionErrorCode[code]);
  }
}
export class ProtobufHttp {
  static status(code: SessionErrorCode): number {
    return statuses[code] ?? 500;
  }
  static write(response: ServerResponse, status: number, body: GameApiResponse): void {
    HttpRequestLogContext.find(response)?.captureReply(body);
    response.setHeader("Content-Type", protobufMediaType);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.writeHead(status);
    response.end(GameApiResponse.encode(body).finish());
  }
  static failure(response: ServerResponse, code: SessionErrorCode): void {
    this.write(response, this.status(code), { outcome: { $case: "failure", failure: { code } } });
  }
  static result(response: ServerResponse, result: DomainReply, kind: ReplyKind): void {
    if (!result.success) {
      const code = SessionErrorCode[result.code as keyof typeof SessionErrorCode];
      this.failure(response, typeof code === "number" && statuses[code] ? code : SessionErrorCode.INTERNAL_ERROR);
      return;
    }
    let outcome: GameApiResponse["outcome"];
    switch (kind) {
      case "joined": outcome = { $case: kind, joined: { sessionId: result.sessionId!, participantToken: result.participantToken!, player: this.player(result.player!) } };
        break;
      case "snapshot": outcome = { $case: kind, snapshot: this.snapshot(result.snapshot!) };
        break;
      case "completed": outcome = { $case: kind, completed: {} };
        break;
      case "data": outcome = { $case: kind, data: { version: result.version!, tables: [...result.tables!] } };
        break;
      case "puzzle": outcome = { $case: kind, puzzle: { accepted: result.accepted!, correct: result.correct!, snapshot: this.snapshot(result.snapshot!) } };
        break;
      case "room": outcome = { $case: kind, room: { roomNo: result.roomNo!, value: result.value!, doorAllowed: result.doorAllowed!, snapshot: this.snapshot(result.snapshot!) } };
        break;
    }
    this.write(response, kind === "joined" ? 201 : 200, { outcome });
  }
  private static player(player: Player) {
    return { playerId: player.id, role: player.role === "A" ? PlayerRole.ROLE_A : PlayerRole.ROLE_B, sceneLoaded: player.ready };
  }
  private static snapshot(snapshot: NonNullable<DomainReply["snapshot"]>) {
    return {
      sessionId: snapshot.sessionId, phase: ({ Waiting: SessionPhase.WAITING, Loading: SessionPhase.LOADING, Playing: SessionPhase.PLAYING })[snapshot.phase],
      players: snapshot.players.map(player => this.player(player)), unlockedRoomIds: [...(snapshot.unlockedRoomIds ?? [])]
    };
  }
  static async read<T>(request: IncomingMessage, decode: (body: Uint8Array) => T): Promise<T> {
    const mediaType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== protobufMediaType) throw new ProtobufRequestError(SessionErrorCode.UNSUPPORTED_MEDIA_TYPE);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 8192) throw new ProtobufRequestError(SessionErrorCode.PAYLOAD_TOO_LARGE);
      chunks.push(Buffer.from(chunk));
    }
    try {
      return decode(Buffer.concat(chunks));
    }
    catch {
      throw new ProtobufRequestError(SessionErrorCode.INVALID_REQUEST);
    }
  }
  static validateAnswers(answers: readonly string[]): void {
    if (answers.length > 64 || answers.some(value => value.length > 256))
      throw new ProtobufRequestError(SessionErrorCode.INVALID_REQUEST);
  }
}
