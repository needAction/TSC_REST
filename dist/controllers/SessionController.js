"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const ParticipantHttpHandler_1 = require("./http/ParticipantHttpHandler");
const ProtobufHttp_1 = require("./http/ProtobufHttp");
const common_1 = require("../generated/escape/v1/common");
const game_api_1 = require("../generated/escape/v1/game_api");
const HttpRequestLogContext_1 = require("./http/HttpRequestLogContext");
class SessionController {
    sessions;
    constructor(sessions) {
        this.sessions = sessions;
    }
    data(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.data(sessionId, token), "data");
    }
    async submit(request, response, sessionId, puzzleId) {
        try {
            const { answers } = await ProtobufHttp_1.ProtobufHttp.read(request, bytes => game_api_1.PuzzleCommandRequest.decode(bytes));
            HttpRequestLogContext_1.HttpRequestLogContext.find(response)?.setPuzzleCommand(puzzleId, answers.length);
            ProtobufHttp_1.ProtobufHttp.validateAnswers(answers);
            ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.submit(sessionId, token, puzzleId, answers), "puzzle");
        }
        catch (error) {
            this.contentFailure(request, response, error);
        }
    }
    async room(request, response, sessionId, answer) {
        try {
            const command = await ProtobufHttp_1.ProtobufHttp.read(request, bytes => game_api_1.RoomCommandRequest.decode(bytes));
            HttpRequestLogContext_1.HttpRequestLogContext.find(response)?.setRoomCommand(command.roomNo, command.answers.length);
            if (!Number.isInteger(command.roomNo) || command.roomNo < 1 || (!answer && command.answers.length !== 0))
                throw new ProtobufHttp_1.ProtobufRequestError(common_1.SessionErrorCode.INVALID_REQUEST);
            ProtobufHttp_1.ProtobufHttp.validateAnswers(command.answers);
            ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.decideRoom(sessionId, token, command.roomNo, answer ? command.answers : undefined), "room");
        }
        catch (error) {
            this.contentFailure(request, response, error);
        }
    }
    contentFailure(request, response, error) {
        request.resume();
        if (!response.headersSent && !response.destroyed)
            ProtobufHttp_1.ProtobufHttp.failure(response, error instanceof ProtobufHttp_1.ProtobufRequestError ? error.code : common_1.SessionErrorCode.INTERNAL_ERROR);
    }
    join(response) {
        const result = this.sessions.join();
        ProtobufHttp_1.ProtobufHttp.result(response, result, "joined");
    }
    ready(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.ready(sessionId, token));
    }
    query(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.query(sessionId, token));
    }
    heartbeat(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.heartbeat(sessionId, token), "completed");
    }
    leave(request, response, sessionId) {
        ParticipantHttpHandler_1.ParticipantHttpHandler.handle(request, response, token => this.sessions.leave(sessionId, token), "completed");
    }
}
exports.SessionController = SessionController;
