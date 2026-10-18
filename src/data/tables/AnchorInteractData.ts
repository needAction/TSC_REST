import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvTableMapping } from "../CsvTableMapping";
import { AnchorData } from "./AnchorData";

// ANCHOR_INTERACT.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class AnchorInteractData extends AnchorData {
  static readonly table = new CsvTableMapping<AnchorInteractData>("ANCHOR_INTERACT", row => new AnchorInteractData(row));

  constructor(row: CsvRow) {
    super(row, AnchorInteractData.table.sheetName);
    Object.freeze(this);
  }
}
