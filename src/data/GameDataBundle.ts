import { createHash } from "node:crypto";
import type { CsvDataSet } from "./CsvDataSet";

export interface GameDataBundle {
  readonly version: string;
  readonly tables: readonly { readonly name: string; readonly csv: string }[];
}

// 디스크를 다시 읽지 않고 검증된 메모리 원본을 전송용 CSV로 직렬화합니다.
export function createGameDataBundle(source: CsvDataSet): GameDataBundle {
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const registry = source.tryGetDocument("REGISTRY");
  const published = registry ? new Set(registry.rows.filter(row => row.get("Active") === "Y").map(row => row.get("Sheet"))) : undefined;
  const tables = [...source.entries()].filter(([name]) => !published || published.has(name)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, document]) => {
    const records = [document.headers, ...document.rows.map(row => document.headers.map(header => row.get(header)))];
    return Object.freeze({ name, csv: records.map(row => row.map(quote).join(",")).join("\n") + "\n" });
  });
  return Object.freeze({ version: createHash("sha256").update(JSON.stringify(tables)).digest("hex"), tables: Object.freeze(tables) });
}
