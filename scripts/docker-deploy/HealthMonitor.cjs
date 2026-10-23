const { setTimeout: delay } = require("node:timers/promises");

// 모든 제한/간격은 정수 ms이며, 시각은 단조 증가 시계에서 얻습니다.
class HealthMonitor {
  constructor(settings, nowMs = () => Number(process.hrtime.bigint() / 1000000n), sleep = delay) {
    this.settings = settings;
    this.nowMs = nowMs;
    this.sleep = sleep;
  }
  async wait(check) {
    const deadline = this.nowMs() + this.settings.healthTimeoutMs;
    while (this.nowMs() < deadline) {
      const remaining = () => Math.max(0, deadline - this.nowMs());
      const requestBudget = () => Math.min(this.settings.healthRequestTimeoutMs, remaining());
      if (await check(requestBudget) && this.nowMs() < deadline) return;
      const pause = Math.min(this.settings.healthIntervalMs, remaining());
      if (pause > 0) await this.sleep(pause);
    }
    throw new Error(`상태 확인 실패: ${this.settings.healthTimeoutMs}ms 안에 컨테이너와 공개 /health 응답이 정상화되지 않았습니다.`);
  }
}

async function checkPublicHealth(url, timeoutMs) {
  if (timeoutMs < 1) return false;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    return (await response.json()).status === "ok";
  } catch {
    return false;
  }
}

module.exports = { HealthMonitor, checkPublicHealth };
