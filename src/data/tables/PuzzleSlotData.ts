import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// PUZZLE_SLOT.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class PuzzleSlotData {
  static readonly table = new CsvTableMapping<PuzzleSlotData>("PUZZLE_SLOT", row => new PuzzleSlotData(row));
  readonly id: number;
  readonly puzzleId: number;
  readonly slot: number;
  readonly display: string;
  readonly answer: string;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, PuzzleSlotData.table.sheetName);
    this.id = value.integer("ID");
    this.puzzleId = value.integer("PuzzleID");
    this.slot = value.integer("Slot");
    this.display = value.text("Display");
    this.answer = value.text("Answer");
    Object.freeze(this);
  }
}
