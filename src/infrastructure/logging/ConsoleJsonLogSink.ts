import type { DiagnosticLogEntry, ILogSink } from "../../common/logging/ILogSink";

// stdout에 JSON 한 줄씩 출력합니다. Docker의 기존 로그 수집 경로를 그대로 사용합니다.
export class ConsoleJsonLogSink<TEntry extends DiagnosticLogEntry> implements ILogSink<TEntry> {
  write(entry: TEntry): void {
    console.log(JSON.stringify(entry));
  }
}
