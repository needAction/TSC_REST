import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// CHARACTER_STAT.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class CharacterStatData {
  static readonly table = new CsvTableMapping<CharacterStatData>("CHARACTER_STAT", row => new CharacterStatData(row));
  readonly id: number;
  readonly walkSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly mouseSensitivity: number;
  readonly pitchLimit: number;
  readonly fov: number;
  readonly eyeHeight: number;
  readonly capsuleHeight: number;
  readonly capsuleRadius: number;
  readonly stepOffset: number;
  readonly interactDistance: number;
  readonly closeUpOpenMs: number;
  readonly headBob: number;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, CharacterStatData.table.sheetName);
    this.id = value.integer("ID");
    this.walkSpeed = value.number("WalkSpeed");
    this.acceleration = value.number("Acceleration");
    this.deceleration = value.number("Deceleration");
    this.mouseSensitivity = value.number("MouseSensitivity");
    this.pitchLimit = value.number("PitchLimit");
    this.fov = value.number("FOV");
    this.eyeHeight = value.number("EyeHeight");
    this.capsuleHeight = value.number("CapsuleHeight");
    this.capsuleRadius = value.number("CapsuleRadius");
    this.stepOffset = value.number("StepOffset");
    this.interactDistance = value.number("InteractDistance");
    this.closeUpOpenMs = value.integer("CloseUpOpenMs");
    this.headBob = value.number("HeadBob");
    Object.freeze(this);
  }
}
