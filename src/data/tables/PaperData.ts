import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// PAPER.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class PaperData {
  static readonly table = new CsvTableMapping<PaperData>("PAPER", row => new PaperData(row));
  readonly anchorRef: number;
  readonly equation1: string;
  readonly equation2: string;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, PaperData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.equation1 = value.text("Equation1");
    this.equation2 = value.text("Equation2");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
