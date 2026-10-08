"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
class SessionController {
    sessions;
    constructor(sessions) {
        this.sessions = sessions;
    }
    join(response) {
        const result = this.sessions.join();
        response.writeHead(result.success ? 201 : 409);
        response.end(JSON.stringify(result));
    }
    ready(request, response, sessionId) {
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
exports.SessionController = SessionController;
