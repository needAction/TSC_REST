import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// LOCK.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class LockData {
  static readonly table = new CsvTableMapping<LockData>("LOCK", row => new LockData(row));
  readonly anchorRef: number;
  readonly dialFace: string;
  readonly dialLetters: readonly string[];
  readonly displayFace: string;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, LockData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.dialFace = value.text("DialFace");
    this.dialLetters = value.list("DialLetters");
    this.displayFace = value.text("DisplayFace");
    Object.freeze(this);
  }
}
