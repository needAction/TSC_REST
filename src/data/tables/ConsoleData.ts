import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// CONSOLE.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class ConsoleData {
  static readonly table = new CsvTableMapping<ConsoleData>("CONSOLE", row => new ConsoleData(row));
  readonly anchorRef: number;
  readonly slotCount: number;
  readonly buttons: readonly string[];

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, ConsoleData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.slotCount = value.integer("SlotCount");
    this.buttons = value.list("Buttons");
    Object.freeze(this);
  }
}
