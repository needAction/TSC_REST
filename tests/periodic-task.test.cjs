const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PeriodicTask } = require("../dist/common/timing/PeriodicTask");
const { NodeIntervalScheduler } = require("../dist/infrastructure/timing/NodeIntervalScheduler");
const { GameSession } = require("../dist/models/GameSession");
const { createSessionService } = require("./helpers/createSessionService.cjs");

class ManualScheduler {
  jobs = [];
  scheduleRepeated(callback, intervalMs) {
    const job = { callback, intervalMs, active: true };
    this.jobs.push(job);
    return () => { job.active = false; };
  }
  fire() {
    for (const job of this.jobs) if (job.active) job.callback();
  }
}

test("주기 작업은 시작 전·중지 후 실행되지 않고 중복 시작하지 않는다", () => {
  const scheduler = new ManualScheduler();
  let calls = 0;
  const task = new PeriodicTask(scheduler, 500, () => calls++);
  scheduler.fire();
  assert.equal(calls, 0);
  task.start();
  task.start();
  assert.equal(scheduler.jobs.length, 1);
  assert.equal(scheduler.jobs[0].intervalMs, 500);
  assert.equal(task.isRunning, true);
  scheduler.fire();
  assert.equal(calls, 1);
  task.stop();
  task.stop();
  scheduler.fire();
  assert.equal(calls, 1);
  assert.equal(task.isRunning, false);
  task.start();
  scheduler.fire();
  assert.equal(calls, 2);
  task.stop();
});

test("HTTP 요청 없이 주기 작업이 만료 참가자만 제거한다", () => {
  const clock = { elapsedMilliseconds: 0 };
  const session = new GameSession({ id: "test", roles: ["A", "B"] });
  const service = createSessionService(session, clock);
  const a = service.join();
  const b = service.join();
  service.ready("test", a.participantToken);
  service.ready("test", b.participantToken);
  clock.elapsedMilliseconds = 3000;
  service.heartbeat("test", b.participantToken);

  const scheduler = new ManualScheduler();
  const task = new PeriodicTask(scheduler, 500, () => service.expireParticipants());
  task.start();
  clock.elapsedMilliseconds = 9999;
  scheduler.fire();
  assert.equal(session.getSnapshot().players.length, 2);
  clock.elapsedMilliseconds = 10000;
  scheduler.fire();
  assert.deepEqual(session.getSnapshot().players.map(player => player.id), [b.player.id]);
  assert.equal(session.phase, "Waiting");
  clock.elapsedMilliseconds = 13000;
  scheduler.fire();
  assert.equal(session.getSnapshot().players.length, 0);
  task.stop();
});

test("Node 타이머도 설정 간격으로 실행되고 중지하면 해제된다", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const task = new PeriodicTask(new NodeIntervalScheduler(), 500, () => calls++);
  t.after(() => task.stop());
  task.start();
  t.mock.timers.tick(499);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
  t.mock.timers.tick(500);
  assert.equal(calls, 2);
  task.stop();
  t.mock.timers.tick(1000);
  assert.equal(calls, 2);
});

test("공통 주기 작업과 Node 어댑터는 잘못된 간격을 거부한다", () => {
  for (const interval of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => new PeriodicTask(new ManualScheduler(), interval, () => {}));
    assert.throws(() => new NodeIntervalScheduler().scheduleRepeated(() => {}, interval));
  }
  assert.throws(() => new NodeIntervalScheduler().scheduleRepeated(() => {}, 2147483648));
});
