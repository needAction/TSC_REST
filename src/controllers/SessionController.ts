import { IncomingMessage, ServerResponse } from "node:http";
import { SessionService } from "../services/SessionService";
import { ParticipantHttpHandler } from "./http/ParticipantHttpHandler";

export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  join(response: ServerResponse): void {
    const result = this.sessions.join();

    response.writeHead(result.success ? 201 : 409);
    response.end(JSON.stringify(result));
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
      token => this.sessions.heartbeat(sessionId, token));
  }

  leave(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response,
      token => this.sessions.leave(sessionId, token));
  }
}
