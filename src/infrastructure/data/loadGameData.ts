import { readdir } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import { CsvDataSet } from "../../data/CsvDataSet";
import { CsvDataStore } from "../../data/CsvDataStore";
import { CsvValidator } from "../../data/validation/CsvValidator";
import { CsvGameData } from "../../data/tables/CsvGameData";
import { CsvLoader } from "../../common/csv/CsvLoader";
import type { ICsvTextSource } from "../../common/csv/CsvLoader";
import { CsvParser } from "../../common/csv/CsvParser";
import { Utf8CsvFileSource } from "./Utf8CsvFileSource";

// 폴더 탐색은 인프라 경계에서 처리하고 메모리 검증·변환과 분리합니다.
export async function readCsvDirectory(folder: string, signal?: AbortSignal, source: ICsvTextSource = new Utf8CsvFileSource()): Promise<CsvDataSet> {
  signal?.throwIfAborted();
  const files = (await readdir(folder, { withFileTypes: true })).filter(file => file.isFile() && extname(file.name).toLowerCase() === ".csv");
  signal?.throwIfAborted();
  const locations = files.map(file => [basename(file.name, extname(file.name)), join(folder, file.name)] as const);
  return CsvDataSet.load(locations, new CsvLoader(source, new CsvParser()), signal);
}

// main 또는 기능 조립 지점에서 한 번 호출하고 반환 테이블을 필요한 함수/객체에 주입합니다.
export async function loadGameData(folder: string, signal?: AbortSignal, store = new CsvDataStore(), validator = new CsvValidator()): Promise<CsvGameData> {
  const report = await store.initialize(signal => readCsvDirectory(folder, signal), validator, signal);
  if (!report.isValid) throw new Error("CSV validation failed:\n" + report.issues.filter(issue => issue.severity === "Error").join("\n"));
  return new CsvGameData(store);
}
