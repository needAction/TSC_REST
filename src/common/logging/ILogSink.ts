// 전송 기술과 독립적인 구조화 로그 계약입니다. 후속 패킷 처리 이벤트도 이 출력 포트를 재사용합니다.
export interface DiagnosticLogEntry {
  readonly event: string;
  readonly message: string;
  readonly timestamp: string;
  readonly requestId: string;
}

export interface ILogSink<TEntry extends DiagnosticLogEntry = DiagnosticLogEntry> {
  write(entry: TEntry): void;
}
