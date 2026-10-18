import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// TV.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class TvData {
  static readonly table = new CsvTableMapping<TvData>("TV", row => new TvData(row));
  readonly anchorRef: number;
  readonly letter: string;
  readonly number: number;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, TvData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.letter = value.text("Letter");
    this.number = value.integer("Number");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
