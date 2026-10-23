const { GameApiResponse } = require('../../dist/generated/escape/v1/game_api');
const { SessionErrorCode } = require('../../dist/generated/escape/v1/common');
const { SessionPhase, PlayerRole } = require('../../dist/generated/escape/v1/session');
const player = p => ({ id: p.playerId, role: p.role === PlayerRole.ROLE_A ? 'A' : 'B', ready: p.sceneLoaded });
const snapshot = s => ({
  sessionId: s.sessionId, phase: { [SessionPhase.WAITING]: 'Waiting', [SessionPhase.LOADING]: 'Loading', [SessionPhase.PLAYING]: 'Playing' }[s.phase],
  players: s.players.map(player), ...(s.unlockedRoomIds.length ? { unlockedRoomIds: s.unlockedRoomIds } : {})
});
// Existing assertions describe domain values; decode the actual binary response before comparing them.
function decodeReply(bytes) {
  const reply = GameApiResponse.decode(bytes).outcome;
  if (!reply) throw new Error('Empty Protobuf outcome');
  switch (reply.$case) {
    case 'failure': return { success: false, code: SessionErrorCode[reply.failure.code] };
    case 'joined': return { success: true, sessionId: reply.joined.sessionId, player: player(reply.joined.player), participantToken: reply.joined.participantToken };
    case 'snapshot': return { success: true, snapshot: snapshot(reply.snapshot) };
    case 'completed': return { success: true };
    case 'data': return { success: true, ...reply.data };
    case 'puzzle': return { success: true, ...reply.puzzle, snapshot: snapshot(reply.puzzle.snapshot) };
    case 'room': return { success: true, ...reply.room, snapshot: snapshot(reply.room.snapshot) };
  }
}
async function readReply(response) {
  return decodeReply(new Uint8Array(await response.arrayBuffer()));
}
module.exports = { decodeReply, readReply };
