import type { IIntervalScheduler } from "../../common/timing/IIntervalScheduler";

export class NodeIntervalScheduler implements IIntervalScheduler {
  scheduleRepeated(callback: () => void, intervalMs: number): () => void {
    // Node가 범위 밖 간격을 1ms로 바꾸지 않도록 명시적으로 거부합니다.
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2147483647) {
      throw new Error("Node 실행 간격은 1~2147483647 범위의 정수 ms여야 합니다.");
    }

    const handle = setInterval(callback, intervalMs);
    return () => clearInterval(handle);
  }
}
