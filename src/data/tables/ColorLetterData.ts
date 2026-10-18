import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// COLOR_LETTER.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class ColorLetterData {
  static readonly table = new CsvTableMapping<ColorLetterData>("COLOR_LETTER", row => new ColorLetterData(row));
  readonly id: number;
  readonly puzzleId: number;
  readonly letter: string;
  readonly color: string;
  readonly signAnchor: number;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, ColorLetterData.table.sheetName);
    this.id = value.integer("ID");
    this.puzzleId = value.integer("PuzzleID");
    this.letter = value.text("Letter");
    this.color = value.text("Color");
    this.signAnchor = value.integer("SignAnchor");
    Object.freeze(this);
  }
}
