import { IncomingMessage, ServerResponse } from "node:http";
import { SessionService } from "../services/SessionService";
import { ParticipantHttpHandler } from "./http/ParticipantHttpHandler";
import { ProtobufHttp, ProtobufRequestError } from "./http/ProtobufHttp";
import { SessionErrorCode } from "../generated/escape/v1/common";
import { PuzzleCommandRequest, RoomCommandRequest } from "../generated/escape/v1/game_api";

export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  data(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response, token => this.sessions.data(sessionId, token), "data");
  }

  async submit(request: IncomingMessage, response: ServerResponse, sessionId: string, puzzleId: number): Promise<void> {
    try {
      const { answers } = await ProtobufHttp.read(request, bytes => PuzzleCommandRequest.decode(bytes));
      ProtobufHttp.validateAnswers(answers);
      ParticipantHttpHandler.handle(request, response, token => this.sessions.submit(sessionId, token, puzzleId, answers), "puzzle");
    } catch (error) { this.contentFailure(request, response, error); }
  }

  async room(request: IncomingMessage, response: ServerResponse, sessionId: string, answer: boolean): Promise<void> {
    try {
      const command = await ProtobufHttp.read(request, bytes => RoomCommandRequest.decode(bytes));
      if (!Number.isInteger(command.roomNo) || command.roomNo < 1 || (!answer && command.answers.length !== 0))
        throw new ProtobufRequestError(SessionErrorCode.INVALID_REQUEST);
      ProtobufHttp.validateAnswers(command.answers);
      ParticipantHttpHandler.handle(request, response,
        token => this.sessions.decideRoom(sessionId, token, command.roomNo, answer ? command.answers : undefined), "room");
    } catch (error) { this.contentFailure(request, response, error); }
  }
  private contentFailure(request: IncomingMessage, response: ServerResponse, error: unknown): void {
    request.resume();
    if (!response.headersSent && !response.destroyed)
      ProtobufHttp.failure(response, error instanceof ProtobufRequestError ? error.code : SessionErrorCode.INTERNAL_ERROR);
  }

  join(response: ServerResponse): void {
    const result = this.sessions.join();

    ProtobufHttp.result(response, result, "joined");
  }

  ready(
    request: IncomingMessage,
    response: ServerResponse,
    sessionId: string
  ): void {
    ParticipantHttpHandler.handle(request, response,
      token => this.sessions.ready(sessionId, token));
  }

  query(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response,
      token => this.sessions.query(sessionId, token));
  }

  heartbeat(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response,
      token => this.sessions.heartbeat(sessionId, token), "completed");
  }

  leave(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response,
      token => this.sessions.leave(sessionId, token), "completed");
  }
}
