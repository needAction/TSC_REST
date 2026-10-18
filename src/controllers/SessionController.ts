import { IncomingMessage, ServerResponse } from "node:http";
import { SessionService } from "../services/SessionService";
import { ParticipantHttpHandler } from "./http/ParticipantHttpHandler";

export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  data(request: IncomingMessage, response: ServerResponse, sessionId: string): void {
    ParticipantHttpHandler.handle(request, response, token => this.sessions.data(sessionId, token));
  }

  async submit(request: IncomingMessage, response: ServerResponse, sessionId: string, puzzleId: number): Promise<void> {
    // 입력 크기와 형식은 HTTP 경계에서 제한합니다. 정답 비교는 모델의 책임입니다.
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) { response.writeHead(413); response.end(); return; }
        chunks.push(Buffer.from(chunk));
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const answers = (body as { answers?: unknown })?.answers;
      if (!Array.isArray(answers) || answers.length > 64 || !answers.every(value => typeof value === "string" && value.length <= 256))
        throw new Error("Invalid answers.");
      ParticipantHttpHandler.handle(request, response, token => this.sessions.submit(sessionId, token, puzzleId, answers));
    } catch {
      if (!response.headersSent) response.writeHead(400);
      response.end(JSON.stringify({ message: "answers 문자열 배열이 필요합니다." }));
    }
  }

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
