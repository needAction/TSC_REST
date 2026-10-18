import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// SOUND_LINK.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class SoundLinkData {
  static readonly table = new CsvTableMapping<SoundLinkData>("SOUND_LINK", row => new SoundLinkData(row));
  readonly id: number;
  readonly trigger: string;
  readonly targetSheet: string;
  readonly targetId: number;
  readonly soundId: number;
  readonly active: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, SoundLinkData.table.sheetName);
    this.id = value.integer("ID");
    this.trigger = value.text("Trigger");
    this.targetSheet = value.text("TargetSheet");
    this.targetId = value.integer("TargetID");
    this.soundId = value.integer("SoundID");
    this.active = value.flag("Active");
    Object.freeze(this);
  }
}
