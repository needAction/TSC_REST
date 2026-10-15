const {
  SessionService
} = require("../../dist/services/SessionService");

const {
  ParticipantRegistry
} = require("../../dist/services/ParticipantRegistry");

function createSessionService(
  session,
  clock = { elapsedMilliseconds: 0 }
) {
  return new SessionService(
    session,
    new ParticipantRegistry(clock, 10000)
  );
}

module.exports = { createSessionService };