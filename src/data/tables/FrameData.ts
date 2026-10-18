import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// FRAME.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class FrameData {
  static readonly table = new CsvTableMapping<FrameData>("FRAME", row => new FrameData(row));
  readonly anchorRef: number;
  readonly color: string;
  readonly wall: string;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, FrameData.table.sheetName);
    this.anchorRef = value.integer("AnchorRef");
    this.color = value.text("Color");
    this.wall = value.text("Wall");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
