import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// PREFAB.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class PrefabData {
  static readonly table = new CsvTableMapping<PrefabData>("PREFAB", row => new PrefabData(row));
  readonly id: number;
  readonly path: string;
  readonly group: string;
  readonly components: readonly number[];

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, PrefabData.table.sheetName);
    this.id = value.integer("ID");
    this.path = value.text("Path");
    this.group = value.text("Group");
    this.components = value.idList("Components", "|");
    Object.freeze(this);
  }
}
