import type { IIntervalScheduler } from "./IIntervalScheduler";

// 만료 규칙이나 Node 타이머 API를 모르는 공통 주기 작업입니다.
export class PeriodicTask {
  private cancel: (() => void) | undefined;

  constructor(
    private readonly scheduler: IIntervalScheduler,
    private readonly intervalMs: number,
    private readonly callback: () => void
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new Error("실행 간격은 양의 안전한 정수 ms여야 합니다.");
    }
  }

  get isRunning(): boolean {
    return this.cancel !== undefined;
  }

  start(): void {
    if (this.isRunning) return;
    this.cancel = this.scheduler.scheduleRepeated(this.callback, this.intervalMs);
  }

  stop(): void {
    const cancel = this.cancel;
    this.cancel = undefined;
    cancel?.();
  }
}
