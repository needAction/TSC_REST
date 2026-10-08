import { IncomingMessage, ServerResponse } from "node:http";
import { SessionService } from "../services/SessionService";

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
    const token = request.headers["x-participant-token"];

    if (typeof token !== "string" || token.length === 0) {
      response.writeHead(400);
      response.end(JSON.stringify({
        success: false,
        code: "PARTICIPANT_TOKEN_REQUIRED"
      }));
      return;
    }

    const result = this.sessions.ready(sessionId, token);

    const status = result.success
      ? 200
      : result.code === "SESSION_NOT_FOUND"
        ? 404
        : 403;

    response.writeHead(status);
    response.end(JSON.stringify(result));
  }
}