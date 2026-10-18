import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader } from "../CsvTableMapping";

// 동일 구조의 테이블은 필드와 변환을 공유합니다.
export abstract class AnchorData {
  readonly id: number;
  readonly roomNo: number;
  readonly playerType: string;
  readonly anchorId: string;
  readonly prefabId: number;
  readonly active: boolean;

  protected constructor(row: CsvRow, sheet: string) {
    const value = new CsvRowReader(row, sheet);
    this.id = value.integer("ID");
    this.roomNo = value.integer("RoomNo");
    this.playerType = value.text("PlayerType");
    this.anchorId = value.text("AnchorID");
    this.prefabId = value.integer("PrefabID");
    this.active = value.flag("Active");
  }
}
