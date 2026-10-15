"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const ParticipantHttpHandler_1 = require("./http/ParticipantHttpHandler");
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
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.ready(sessionId, token));
    }
    query(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.query(sessionId, token));
    }
    heartbeat(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.heartbeat(sessionId, token));
    }
    leave(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.leave(sessionId, token));
    }
}
exports.SessionController = SessionController;
