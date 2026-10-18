import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader } from "../CsvTableMapping";

// 동일 구조의 테이블은 필드와 변환을 공유합니다.
export abstract class RoomData {
  readonly id: number;
  readonly roomNo: number;
  readonly role: string;
  readonly roomPrefabId: number;
  readonly puzzleId: number;
  readonly targetMs: number;
  readonly exitRule: string;
  readonly active: boolean;
  readonly next: number;

  protected constructor(row: CsvRow, sheet: string) {
    const value = new CsvRowReader(row, sheet);
    this.id = value.integer("ID");
    this.roomNo = value.integer("RoomNo");
    this.role = value.text("Role");
    this.roomPrefabId = value.integer("RoomPrefabID");
    this.puzzleId = value.integer("PuzzleID");
    this.targetMs = value.integer("TargetMs");
    this.exitRule = value.text("ExitRule");
    this.active = value.flag("Active");
    this.next = value.integer("Next");
  }
}
