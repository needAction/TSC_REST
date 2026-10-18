import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// WIRE.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class WireData {
  static readonly table = new CsvTableMapping<WireData>("WIRE", row => new WireData(row));
  readonly anchorRef: number;
  readonly color: string;
  readonly lengthM: number;
  readonly isAnswer: boolean;
  readonly port: number;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, WireData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.color = value.text("Color");
    this.lengthM = value.number("LengthM");
    this.isAnswer = value.flag("IsAnswer");
    this.port = value.integer("Port");
    Object.freeze(this);
  }
}
