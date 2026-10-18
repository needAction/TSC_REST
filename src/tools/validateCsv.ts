import { resolve } from "node:path";
import { CsvDataStore } from "../data/CsvDataStore";
import { CsvValidator } from "../data/validation/CsvValidator";
import { CsvGameData } from "../data/tables/CsvGameData";
import { readCsvDirectory } from "../infrastructure/data/loadGameData";

async function main(): Promise<void> {
  if (process.argv.length > 3) throw new Error("사용법: npm run csv:validate -- [CSV 폴더]");
  const folder = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, "../../data");
  const store = new CsvDataStore();
  const report = await store.initialize(() => readCsvDirectory(folder), new CsvValidator());
  for (const issue of report.issues) console.log(issue.toString());
  console.log(`[CSV] ${report.fileCount}개 파일 / 오류 ${report.errorCount}개 / 경고 ${report.warningCount}개`);
  if (!report.isValid) { process.exitCode = 1; return; }
  const gameData = new CsvGameData(store);
  console.log(`[CSV] 데이터 클래스 변환 완료: ${gameData.source.fileCount}개 파일`);
}

if (require.main === module) main().catch(error => {
  console.error(`[CSV 오류] ${error.message}`);
  process.exitCode = 1;
});
