import { createServer } from "node:http";
import type { Server } from "node:http";
import type { SessionController } from "../../controllers/SessionController";
import { ProtobufHttp } from "../../controllers/http/ProtobufHttp";
import { SessionErrorCode } from "../../generated/escape/v1/common";
import { gameApiOpenApi, gameApiOperations } from "../../generated/http/game-api";
import { HttpAccessLogger } from "./HttpAccessLogger";
import { SwaggerUiHttpHandler } from "./SwaggerUiHttpHandler";

const routes = gameApiOperations.map(operation => ({
  operation,
  expression: new RegExp("^" + operation.path.replace("{sessionId}", "([^/]+)").replace("{puzzleId}", "([1-9][0-9]*)") + "$")
}));

// OpenAPI에서 생성한 경로를 사용하고 실제 요청 처리는 Controller에 위임합니다.
export function createSessionHttpServer(controller: SessionController, accessLogger = new HttpAccessLogger()): Server {
  const swagger = new SwaggerUiHttpHandler();
  return createServer((request, response) => {
    const log = accessLogger.observe(request, response);
    try {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (request.method === "GET" && (pathname === "/swagger" || pathname.startsWith("/swagger/"))) {
        log.setRoute("SwaggerUi", "/swagger/{asset}");
        if (swagger.handle(request.method, pathname, response)) return;
      }
      if (request.method === "GET" && (pathname === "/health" || pathname === "/openapi.json")) {
        log.setRoute(pathname === "/health" ? "Health" : "OpenApi", pathname);
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.writeHead(200);
        response.end(JSON.stringify(pathname === "/health" ? { status: "ok" } : gameApiOpenApi));
        return;
      }
      for (const { operation, expression } of routes) {
        const match = operation.method === request.method ? expression.exec(pathname) : null;
        if (!match) continue;
        log.setRoute(operation.name, operation.path);
        const sessionId = match[1] ? decodeURIComponent(match[1]) : "";
        switch (operation.name) {
          case "JoinSession": controller.join(response);
            break;
          case "QuerySession": controller.query(request, response, sessionId);
            break;
          case "ReportSceneLoaded": controller.ready(request, response, sessionId);
            break;
          case "Heartbeat": controller.heartbeat(request, response, sessionId);
            break;
          case "LeaveSession": controller.leave(request, response, sessionId);
            break;
          case "DownloadData": controller.data(request, response, sessionId);
            break;
          case "SubmitPuzzle": void controller.submit(request, response, sessionId, Number(match[2]));
            break;
          case "SubmitRoomAnswer": void controller.room(request, response, sessionId, true);
            break;
          case "CheckRoomDoor": void controller.room(request, response, sessionId, false);
            break;
          default: ProtobufHttp.failure(response, SessionErrorCode.ROUTE_NOT_FOUND);
        }
        return;
      }
      ProtobufHttp.failure(response, SessionErrorCode.ROUTE_NOT_FOUND);
    } catch (error) {
      if (!response.headersSent) ProtobufHttp.failure(response,
        error instanceof URIError ? SessionErrorCode.INVALID_REQUEST : SessionErrorCode.INTERNAL_ERROR);
    }
  });
}
