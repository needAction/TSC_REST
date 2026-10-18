import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// GAME_CONFIG.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class GameConfigData {
  static readonly table = new CsvTableMapping<GameConfigData>("GAME_CONFIG", row => new GameConfigData(row));
  private readonly integerValue?: number;
  private readonly numberValue?: number;
  readonly id: number;
  readonly value: string;
  readonly type: string;
  readonly unit: string;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, GameConfigData.table.sheetName);
    this.id = value.integer("ID");
    this.value = value.text("Value");
    this.type = value.text("Type");
    this.unit = value.text("Unit");
    if (this.type === "int") this.integerValue = value.integer("Value", true);
    if (this.type === "float") this.numberValue = value.number("Value");
    Object.freeze(this);
  }

  asInt(): number {
    if (this.integerValue === undefined) throw new Error("GAME_CONFIG value is not int: " + this.id);
    return this.integerValue;
  }
  asFloat(): number {
    if (this.numberValue === undefined) throw new Error("GAME_CONFIG value is not float: " + this.id);
    return this.numberValue;
  }
}
