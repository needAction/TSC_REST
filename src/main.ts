import { createServer } from "node:http";
import { GameSession } from "./models/GameSession";
import { SessionService } from "./services/SessionService";
import { SessionController } from "./controllers/SessionController";

const port = 3000;

// 초기 조립: 나중에 Bootstrapper로 분리합니다.
const session = new GameSession({
  id: "session-001",
  roles: ["A", "B"]
});

const sessionService = new SessionService(session);
const sessionController = new SessionController(sessionService);

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200);
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method === "POST" && request.url === "/sessions/join") {
    sessionController.join(response);
    return;
  }

  const pathname = new URL(
  request.url ?? "/",
  "http://localhost"
).pathname;

const readyRoute = /^\/sessions\/([^/]+)\/ready$/.exec(pathname);

if (request.method === "POST" && readyRoute !== null) {
  const sessionId = readyRoute[1];

  if (sessionId !== undefined) {
    sessionController.ready(request, response, sessionId);
    return;
  }
}

  response.writeHead(404);
  response.end(JSON.stringify({
    message: "요청한 API가 없습니다."
  }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`서버 실행: http://127.0.0.1:${port}`);
});