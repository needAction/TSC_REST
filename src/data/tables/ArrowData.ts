import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// ARROW.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class ArrowData {
  static readonly table = new CsvTableMapping<ArrowData>("ARROW", row => new ArrowData(row));
  readonly anchorRef: number;
  readonly order: number;
  readonly dir: string;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, ArrowData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.order = value.integer("Order");
    this.dir = value.text("Dir");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
