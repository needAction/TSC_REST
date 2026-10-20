import { roomExitRuleNames } from "../RoomExitRules";

export interface CsvColumnSchema {
  readonly name: string;
  readonly kind: "text" | "integer" | "number";
  readonly optional?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
}
export interface CsvReferenceSchema {
  readonly column: string;
  readonly target: string;
  readonly targetKind?: string;
  readonly sentinel?: string;
}
export interface CsvTableSchema {
  readonly name: string;
  readonly key: string;
  readonly tag?: string;
  readonly kind?: string;
  readonly player?: string;
  readonly keyGroup?: string;
  readonly columns: readonly CsvColumnSchema[];
  readonly references?: readonly CsvReferenceSchema[];
  readonly uniqueKeys?: readonly (readonly string[])[];
}

// 검증기는 파일명 대신 역할을 사용합니다. 실제 CSV명은 아래 정의와 각 데이터 클래스의 table에서 연결합니다.
export const TableTags = Object.freeze({
  component: "component", registry: "registry", room: "room", anchor: "anchor", prefab: "prefab",
  puzzle: "puzzle", slot: "slot", console: "console", sound: "sound",
  soundLink: "sound-link", config: "config", lock: "lock", arrow: "arrow", wire: "wire", characterStat: "character-stat"
});

export function freezeSchemas(schemas: readonly CsvTableSchema[]): readonly CsvTableSchema[] {
  const names = new Set<string>();
  const frozen = schemas.map(schema => {
    if (!schema.name || names.has(schema.name)) throw new Error("Duplicate or empty CSV schema: " + schema.name);
    names.add(schema.name);
    const columns = schema.columns.map(column => Object.freeze({
      ...column, values: column.values ? Object.freeze([...column.values]) : undefined
    }));
    const keys = new Set(columns.map(column => column.name));
    if (keys.size !== columns.length || !keys.has(schema.key)) throw new Error("Invalid CSV schema: " + schema.name);
    const references = (schema.references ?? []).map(reference => {
      if (!keys.has(reference.column)) throw new Error("Unknown reference column: " + reference.column);
      return Object.freeze({ ...reference });
    });
    const uniqueKeys = (schema.uniqueKeys ?? []).map(key => {
      if (key.length === 0 || key.some(column => !keys.has(column))) throw new Error("Invalid unique key: " + schema.name);
      return Object.freeze([...key]);
    });
    return Object.freeze({ ...schema, columns: Object.freeze(columns), references: Object.freeze(references), uniqueKeys: Object.freeze(uniqueKeys) });
  });
  if (frozen.filter(schema => schema.tag === TableTags.registry).length !== 1) throw new Error("Exactly one registry schema is required.");
  for (const schema of frozen) for (const reference of schema.references) {
    if (reference.target !== "$self" && !frozen.some(target => target.tag === reference.target))
      throw new Error("Unknown reference target: " + reference.target);
  }
  return Object.freeze(frozen);
}
const anchorProfile = {
  keyGroup: "anchor",
  key: "ID",
  tag: "anchor",
  columns: [
    {name: "ID", kind: "integer", min: 1},
    {name: "RoomNo", kind: "integer", min: 1},
    {name: "PlayerType", kind: "text", values: ["A", "B", "ALL"]},
    {name: "AnchorID", kind: "text"},
    {name: "PrefabID", kind: "integer", min: 1},
    {name: "Active", kind: "text", values: ["Y", "N"]},
  ],
  references: [{column: "PrefabID", target: "prefab"}],
} as const;

const roomProfile = {
  keyGroup: "room",
  key: "ID",
  tag: "room",
  columns: [
    {name: "ID", kind: "integer", min: 1},
    {name: "RoomNo", kind: "integer", min: 1},
    {name: "Role", kind: "text", values: ["Clue", "Solver"]},
    {name: "RoomPrefabID", kind: "integer", min: 1},
    {name: "PuzzleID", kind: "integer", min: 1},
    {name: "TargetMs", kind: "integer", min: 1},
    {name: "ExitRule", kind: "text", values: roomExitRuleNames},
    {name: "Active", kind: "text", values: ["Y", "N"]},
    {name: "Next", kind: "integer", min: 0},
  ],
  references: [{column: "RoomPrefabID", target: "prefab"}, {column: "PuzzleID", target: "puzzle"}, {column: "Next", target: "$self", sentinel: "0"}],
  uniqueKeys: [["RoomNo"]],
} as const;

export const defaultSchemas = freezeSchemas([
  { ...anchorProfile, name: "ANCHOR_INTERACT", kind: "Interact" },
  { ...anchorProfile, name: "ANCHOR_NONINTERACT", kind: "NonInteract" },
  {
    name: "ARROW",
    key: "AnchorRef",
    tag: "arrow",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Order", kind: "integer", min: 1},
      {name: "Dir", kind: "text", values: ["Up", "Down", "Left", "Right"]},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    key: "ID",
    name: "CARD",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "CardNo", kind: "integer", min: 1},
      {name: "TopMark", kind: "text"},
      {name: "BottomMark", kind: "text"},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
    uniqueKeys: [["AnchorRef", "CardNo"]],
  },
  {
    key: "ID",
    name: "CHARACTER_STAT", tag: TableTags.characterStat,
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "WalkSpeed", kind: "number", min: 0},
      {name: "Acceleration", kind: "number", min: 0},
      {name: "Deceleration", kind: "number", min: 0},
      {name: "MouseSensitivity", kind: "number", min: 0},
      {name: "PitchLimit", kind: "number", min: 0},
      {name: "FOV", kind: "number", min: 0},
      {name: "EyeHeight", kind: "number", min: 0},
      {name: "CapsuleHeight", kind: "number", min: 0},
      {name: "CapsuleRadius", kind: "number", min: 0},
      {name: "StepOffset", kind: "number", min: 0},
      {name: "InteractDistance", kind: "number", min: 0},
      {name: "CloseUpOpenMs", kind: "integer", min: 0},
      {name: "HeadBob", kind: "number", min: 0},
    ],
  },
  {
    key: "ID",
    name: "COLOR_LETTER",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "PuzzleID", kind: "integer", min: 1},
      {name: "Letter", kind: "text"},
      {name: "Color", kind: "text"},
      {name: "SignAnchor", kind: "integer", min: 1},
    ],
    references: [{column: "SignAnchor", target: "anchor", targetKind: "NonInteract"}],
  },
  {
    key: "ID",
    name: "COMPONENT", tag: "component",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Script", kind: "text"},
      {name: "Params", kind: "text"},
    ],
  },
  {
    name: "CONSOLE",
    key: "AnchorRef",
    tag: "console",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "SlotCount", kind: "integer", min: 1},
      {name: "Buttons", kind: "text"},
    ],
  },
  {
    name: "FORMULA",
    key: "AnchorRef",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Symbol", kind: "text"},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "FRAME",
    key: "AnchorRef",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Color", kind: "text"},
      {name: "Wall", kind: "text"},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "GAME_CONFIG",
    key: "ID",
    tag: "config",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Value", kind: "text"},
      {name: "Type", kind: "text", values: ["int", "float", "color", "string"]},
      {name: "Unit", kind: "text", optional: true},
    ],
  },
  {
    name: "LOCK",
    key: "AnchorRef",
    tag: "lock",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "DialFace", kind: "text"},
      {name: "DialLetters", kind: "text", optional: true},
      {name: "DisplayFace", kind: "text"},
    ],
  },
  {
    name: "PAPER",
    key: "AnchorRef",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Equation1", kind: "text"},
      {name: "Equation2", kind: "text"},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "PREFAB",
    key: "ID",
    tag: "prefab",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Path", kind: "text"},
      {name: "Group", kind: "text"},
      {name: "Components", kind: "text", optional: true},
    ],
  },
  {
    name: "PUZZLE_SLOT",
    key: "ID",
    tag: "slot",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "PuzzleID", kind: "integer", min: 1},
      {name: "Slot", kind: "integer", min: 1},
      {name: "Display", kind: "text", optional: true},
      {name: "Answer", kind: "text"},
    ],
    uniqueKeys: [["PuzzleID", "Slot"]],
  },
  {
    name: "PUZZLE",
    key: "ID",
    tag: "puzzle",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Type", kind: "text"},
      {name: "SolverRoom", kind: "integer", min: 1},
      {name: "ClueRoom", kind: "integer", optional: true, min: 1},
      {name: "InputAnchor", kind: "integer", min: 1},
      {name: "SlotCount", kind: "integer", min: 1},
      {name: "Active", kind: "text", values: ["Y", "N"]},
    ],
    references: [{column: "ClueRoom", target: "room"}, {column: "InputAnchor", target: "anchor", targetKind: "Interact"}],
  },
  {
    name: "REGISTRY",
    key: "ID",
    tag: "registry",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Sheet", kind: "text"},
      {name: "File", kind: "text"},
      {name: "Parent", kind: "text"},
      {name: "ParentKey", kind: "text"},
      {name: "Uses", kind: "text"},
      {name: "LoadOrder", kind: "integer", min: 0},
      {name: "Required", kind: "text", values: ["Y", "N"]},
      {name: "Active", kind: "text", values: ["Y", "N"]},
    ],
  },
  { ...roomProfile, name: "ROOM_A", player: "A" },
  { ...roomProfile, name: "ROOM_B", player: "B" },
  {
    name: "SOUND_LINK",
    key: "ID",
    tag: "sound-link",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Trigger", kind: "text"},
      {name: "TargetSheet", kind: "text"},
      {name: "TargetID", kind: "integer", min: 0},
      {name: "SoundID", kind: "integer", min: 1},
      {name: "Active", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "SOUND",
    key: "ID",
    tag: "sound",
    columns: [
      {name: "ID", kind: "integer", min: 1},
      {name: "Category", kind: "text"},
      {name: "Path", kind: "text"},
      {name: "Loop", kind: "text", values: ["Y", "N"]},
      {name: "Volume", kind: "number", min: 0, max: 1},
      {name: "MinDist", kind: "number", optional: true, min: 0},
      {name: "MaxDist", kind: "number", optional: true, min: 0},
      {name: "Bus", kind: "text"},
      {name: "CooldownMs", kind: "integer", min: 0},
      {name: "Active", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "TV",
    key: "AnchorRef",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Letter", kind: "text"},
      {name: "Number", kind: "integer", min: 1},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
    ],
  },
  {
    name: "WIRE",
    key: "AnchorRef",
    tag: "wire",
    columns: [
      {name: "AnchorRef", kind: "integer", min: 1},
      {name: "Color", kind: "text"},
      {name: "LengthM", kind: "number", min: 0},
      {name: "IsAnswer", kind: "text", values: ["Y", "N"]},
      {name: "Port", kind: "integer", min: 1},
    ],
  },
]);
