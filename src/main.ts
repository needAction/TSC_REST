import { resolve } from "node:path";
import { loadGameData } from "./infrastructure/data/loadGameData";
import { GameSession } from "./models/GameSession";
import { randomUUID } from "node:crypto";
import { SessionService } from "./services/SessionService";
import { SessionController } from "./controllers/SessionController";
import { loadServerConfig } from "./config/ServerConfig";
import { ParticipantRegistry } from "./services/ParticipantRegistry";
import { PeriodicTask } from "./common/timing/PeriodicTask";
import { NodeIntervalScheduler } from "./infrastructure/timing/NodeIntervalScheduler";
import { createSessionHttpServer } from "./infrastructure/http/createSessionHttpServer";
import { HttpAccessLogger } from "./infrastructure/http/HttpAccessLogger";
import {
  MonotonicMillisecondClock
} from "./common/MonotonicMillisecondClock";

async function start(): Promise<void> {
  const gameData = await loadGameData(resolve(__dirname, "../data"));
  const config = loadServerConfig(process.env);

  // 초기 조립: 나중에 Bootstrapper로 분리합니다.
  const session = new GameSession({
    // 음성 채널 이름에도 사용하므로 다른 서버 실행과 충돌하지 않는 ID를 발급합니다.
    id: `session-${randomUUID()}`,
    roles: ["A", "B"]
  });

  const clock = new MonotonicMillisecondClock();
  const participants = new ParticipantRegistry(clock, config.participantTimeoutMs);
  const sessionService = new SessionService(session, participants, gameData);
  const sessionController = new SessionController(sessionService);

  const accessLogger = new HttpAccessLogger(undefined, token => {
    const playerId = participants.getPlayerId(token);
    const player = session.getSnapshot().players.find(item => item.id === playerId);
    return player ? { sessionId: session.id, playerId: player.id, role: player.role } : undefined;
  }, clock);
  const server = createSessionHttpServer(sessionController, accessLogger);
  const expirationTask = new PeriodicTask(
    new NodeIntervalScheduler(),
    config.expirationCheckIntervalMs,
    () => sessionService.expireParticipants()
  );

  // 프로세스 신호는 실행 경계에서 처리하고 서비스에는 전달하지 않습니다.
  const shutdown = () => {
    expirationTask.stop();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  server.once("close", () => {
    expirationTask.stop();
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
  });

  server.listen(config.port, config.host, () => {
    expirationTask.start();
    console.log(`서버 수신 주소: ${config.host}, 포트: ${config.port}`);
    console.log(`참가자 만료: ${config.participantTimeoutMs}ms, 검사 간격: ${config.expirationCheckIntervalMs}ms`);
  });

}
void start().catch(error => {
  console.error("서버 초기화 실패:", error);
  process.exitCode = 1;
});
