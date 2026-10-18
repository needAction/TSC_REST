import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvTableMapping } from "../CsvTableMapping";
import { RoomData } from "./RoomData";

// ROOM_A.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class RoomAData extends RoomData {
  static readonly table = new CsvTableMapping<RoomAData>("ROOM_A", row => new RoomAData(row));

  constructor(row: CsvRow) {
    super(row, RoomAData.table.sheetName);
    Object.freeze(this);
  }
}
