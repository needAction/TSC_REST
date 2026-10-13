import { createServer } from "node:http";
import { GameSession } from "./models/GameSession";
import { SessionService } from "./services/SessionService";
import { SessionController } from "./controllers/SessionController";
import { loadServerConfig } from "./config/ServerConfig";

const config = loadServerConfig(process.env);

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

  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const queryRoute = /^\/sessions\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && queryRoute !== null) {
    const sessionId = queryRoute[1];
    if (sessionId !== undefined) {
      sessionController.query(request, response, sessionId);
      return;
    }
  }

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

server.listen(config.port, config.host, () => {
  console.log(`서버 수신 주소: ${config.host}, 포트: ${config.port}`);
});
