import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// PUZZLE.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class PuzzleData {
  static readonly table = new CsvTableMapping<PuzzleData>("PUZZLE", row => new PuzzleData(row));
  readonly id: number;
  readonly type: string;
  readonly solverRoom: number;
  readonly clueRoom: number | null;
  readonly inputAnchor: number;
  readonly slotCount: number;
  readonly active: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, PuzzleData.table.sheetName);
    this.id = value.integer("ID");
    this.type = value.text("Type");
    this.solverRoom = value.integer("SolverRoom");
    this.clueRoom = value.optionalInteger("ClueRoom");
    this.inputAnchor = value.integer("InputAnchor");
    this.slotCount = value.integer("SlotCount");
    this.active = value.flag("Active");
    Object.freeze(this);
  }
}
