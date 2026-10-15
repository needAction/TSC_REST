import { createServer } from "node:http";
import type { Server } from "node:http";
import type { SessionController } from "../../controllers/SessionController";

// 생성만 담당하며, 수신 시작과 타이머 수명은 조립 지점이 소유합니다.
export function createSessionHttpServer(controller: SessionController): Server {
  return createServer((request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && pathname === "/health") {
      response.writeHead(200);
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "POST" && pathname === "/sessions/join") {
      controller.join(response);
      return;
    }

    const participantRoute = /^\/sessions\/([^/]+)(?:\/(ready|heartbeat|leave))?$/.exec(pathname);
    if (participantRoute !== null) {
      const sessionId = participantRoute[1];
      const action = participantRoute[2];

      if (request.method === "GET" && action === undefined) {
        controller.query(request, response, sessionId);
        return;
      }
      if (request.method === "POST" && action === "ready") {
        controller.ready(request, response, sessionId);
        return;
      }
      if (request.method === "POST" && action === "heartbeat") {
        controller.heartbeat(request, response, sessionId);
        return;
      }
      if (request.method === "POST" && action === "leave") {
        controller.leave(request, response, sessionId);
        return;
      }
    }

    response.writeHead(404);
    response.end(JSON.stringify({ message: "요청한 API가 없습니다." }));
  });
}
