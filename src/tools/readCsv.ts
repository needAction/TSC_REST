import { resolve } from "node:path";
import { CsvLoader } from "../common/csv/CsvLoader";
import { CsvParser } from "../common/csv/CsvParser";
import { Utf8CsvFileSource } from "../infrastructure/data/Utf8CsvFileSource";

async function main(): Promise<void> {
  if (process.argv.length !== 3) throw new Error("사용법: npm run csv:read -- <CSV 파일 경로>");
  const loader = new CsvLoader(new Utf8CsvFileSource(), new CsvParser());
  const document = await loader.load(resolve(process.argv[2]));
  console.log(`[CSV] 로드 완료: ${document.sourceName}`);
  console.log(`[CSV] 헤더 ${document.headers.length}개: ${document.headers.join(", ")}`);
  console.log(`[CSV] 데이터 ${document.rows.length}행`);
}

if (require.main === module) main().catch(error => {
  console.error(`[CSV 오류] ${error.message}`);
  process.exitCode = 1;
});
