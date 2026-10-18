import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// COMPONENT.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class ComponentData {
  static readonly table = new CsvTableMapping<ComponentData>("COMPONENT", row => new ComponentData(row));
  readonly id: number;
  readonly script: string;
  readonly params: string;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, ComponentData.table.sheetName);
    this.id = value.integer("ID");
    this.script = value.text("Script");
    this.params = value.text("Params");
    Object.freeze(this);
  }
}
