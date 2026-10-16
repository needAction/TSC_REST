import { readFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import type { ICsvTextSource } from "../../common/csv/CsvLoader";

// Node 파일 읽기만 담당합니다. Windows/Linux 경로는 호출자가 전달합니다.
export class Utf8CsvFileSource implements ICsvTextSource {
  async readText(filePath: string, signal?: AbortSignal): Promise<string> {
    const bytes = await readFile(filePath, { signal });
    signal?.throwIfAborted();
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  }
}
