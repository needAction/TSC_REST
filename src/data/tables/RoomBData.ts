import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvTableMapping } from "../CsvTableMapping";
import { RoomData } from "./RoomData";

// ROOM_B.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class RoomBData extends RoomData {
  static readonly table = new CsvTableMapping<RoomBData>("ROOM_B", row => new RoomBData(row));

  constructor(row: CsvRow) {
    super(row, RoomBData.table.sheetName);
    Object.freeze(this);
  }
}
