import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// REGISTRY.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class RegistryData {
  static readonly table = new CsvTableMapping<RegistryData>("REGISTRY", row => new RegistryData(row));
  readonly id: number;
  readonly sheet: string;
  readonly file: string;
  readonly parent: readonly string[];
  readonly parentKey: readonly string[];
  readonly uses: readonly string[];
  readonly loadOrder: number;
  readonly required: boolean;
  readonly active: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, RegistryData.table.sheetName);
    this.id = value.integer("ID");
    this.sheet = value.text("Sheet");
    this.file = value.text("File");
    this.parent = value.list("Parent", true);
    this.parentKey = value.list("ParentKey", true);
    this.uses = value.list("Uses", true);
    this.loadOrder = value.integer("LoadOrder");
    this.required = value.flag("Required");
    this.active = value.flag("Active");
    Object.freeze(this);
  }
}
