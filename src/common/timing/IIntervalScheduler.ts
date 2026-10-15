export interface IIntervalScheduler {
  // 콜백을 반복 예약하고, 예약 해제 함수를 반환합니다.
  scheduleRepeated(callback: () => void, intervalMs: number): () => void;
}
