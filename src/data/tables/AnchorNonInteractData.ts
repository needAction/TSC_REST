import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvTableMapping } from "../CsvTableMapping";
import { AnchorData } from "./AnchorData";

// ANCHOR_NONINTERACT.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class AnchorNonInteractData extends AnchorData {
  static readonly table = new CsvTableMapping<AnchorNonInteractData>("ANCHOR_NONINTERACT", row => new AnchorNonInteractData(row));

  constructor(row: CsvRow) {
    super(row, AnchorNonInteractData.table.sheetName);
    Object.freeze(this);
  }
}
