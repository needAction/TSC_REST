import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// SOUND.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class SoundData {
  static readonly table = new CsvTableMapping<SoundData>("SOUND", row => new SoundData(row));
  readonly id: number;
  readonly category: string;
  readonly path: string;
  readonly loop: boolean;
  readonly volume: number;
  readonly minDist: number | null;
  readonly maxDist: number | null;
  readonly bus: string;
  readonly cooldownMs: number;
  readonly active: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, SoundData.table.sheetName);
    this.id = value.integer("ID");
    this.category = value.text("Category");
    this.path = value.text("Path");
    this.loop = value.flag("Loop");
    this.volume = value.number("Volume");
    this.minDist = value.optionalNumber("MinDist");
    this.maxDist = value.optionalNumber("MaxDist");
    this.bus = value.text("Bus");
    this.cooldownMs = value.integer("CooldownMs");
    this.active = value.flag("Active");
    Object.freeze(this);
  }
}
