import { CsvDocument } from "./CsvDocument";
import { CsvParser } from "./CsvParser";

export interface ICsvTextSource {
  readText(sourceName: string, signal?: AbortSignal): Promise<string>;
}

// 읽기 → 해석만 조정합니다. 전역 저장소나 콘텐츠 초기화는 하지 않습니다.
export class CsvLoader {
  constructor(private readonly source: ICsvTextSource, private readonly parser: CsvParser) {}

  async load(sourceName: string, signal?: AbortSignal): Promise<CsvDocument> {
    if (!sourceName?.trim()) throw new Error("CSV 경로 또는 이름이 필요합니다.");
    signal?.throwIfAborted();
    const text = await this.source.readText(sourceName, signal);
    signal?.throwIfAborted();
    const document = this.parser.read(text, sourceName);
    signal?.throwIfAborted();
    return document;
  }
}
