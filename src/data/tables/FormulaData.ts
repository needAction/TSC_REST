import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// FORMULA.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class FormulaData {
  static readonly table = new CsvTableMapping<FormulaData>("FORMULA", row => new FormulaData(row));
  readonly anchorRef: number;
  readonly symbol: string;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, FormulaData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.symbol = value.text("Symbol");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
