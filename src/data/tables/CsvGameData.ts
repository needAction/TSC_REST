import type { CsvDataSet } from "../CsvDataSet";
import type { CsvDataStore } from "../CsvDataStore";
import type { CsvTableMapping } from "../CsvTableMapping";
import { AnchorInteractData } from "./AnchorInteractData";
import { AnchorNonInteractData } from "./AnchorNonInteractData";
import { ArrowData } from "./ArrowData";
import { CardData } from "./CardData";
import { CharacterStatData } from "./CharacterStatData";
import { ColorLetterData } from "./ColorLetterData";
import { ComponentData } from "./ComponentData";
import { ConsoleData } from "./ConsoleData";
import { FormulaData } from "./FormulaData";
import { FrameData } from "./FrameData";
import { GameConfigData } from "./GameConfigData";
import { LockData } from "./LockData";
import { PaperData } from "./PaperData";
import { PrefabData } from "./PrefabData";
import { PuzzleSlotData } from "./PuzzleSlotData";
import { PuzzleData } from "./PuzzleData";
import { RegistryData } from "./RegistryData";
import { RoomAData } from "./RoomAData";
import { RoomBData } from "./RoomBData";
import { SoundLinkData } from "./SoundLinkData";
import { SoundData } from "./SoundData";
import { TvData } from "./TvData";
import { WireData } from "./WireData";

// 동일한 등록 원본을 변환한 테이블 묶음입니다. 소비자에는 필요한 readonly 테이블만 주입합니다.
export class CsvGameData {
  readonly source: CsvDataSet;
  readonly interactAnchors: readonly AnchorInteractData[];
  readonly nonInteractAnchors: readonly AnchorNonInteractData[];
  readonly arrows: readonly ArrowData[];
  readonly cards: readonly CardData[];
  readonly characterStats: readonly CharacterStatData[];
  readonly colorLetters: readonly ColorLetterData[];
  readonly components: readonly ComponentData[];
  readonly consoles: readonly ConsoleData[];
  readonly formulas: readonly FormulaData[];
  readonly frames: readonly FrameData[];
  readonly gameConfigs: readonly GameConfigData[];
  readonly locks: readonly LockData[];
  readonly papers: readonly PaperData[];
  readonly prefabs: readonly PrefabData[];
  readonly puzzleSlots: readonly PuzzleSlotData[];
  readonly puzzles: readonly PuzzleData[];
  readonly registry: readonly RegistryData[];
  readonly roomsA: readonly RoomAData[];
  readonly roomsB: readonly RoomBData[];
  readonly soundLinks: readonly SoundLinkData[];
  readonly sounds: readonly SoundData[];
  readonly tvs: readonly TvData[];
  readonly wires: readonly WireData[];

  constructor(store: CsvDataStore) {
    if (!store.data) throw new Error("Register valid CSV data before creating game data.");
    this.source = store.data;
    this.registry = resolveTable(store, RegistryData.table);
    const active = new Set(this.registry.filter(row => row.active).map(row => row.sheet));
    const resolve = <T>(mapping: CsvTableMapping<T>): readonly T[] =>
      active.has(mapping.sheetName) ? resolveTable(store, mapping) : Object.freeze([]);
    this.interactAnchors = resolve(AnchorInteractData.table);
    this.nonInteractAnchors = resolve(AnchorNonInteractData.table);
    this.arrows = resolve(ArrowData.table);
    this.cards = resolve(CardData.table);
    this.characterStats = resolve(CharacterStatData.table);
    this.colorLetters = resolve(ColorLetterData.table);
    this.components = resolve(ComponentData.table);
    this.consoles = resolve(ConsoleData.table);
    this.formulas = resolve(FormulaData.table);
    this.frames = resolve(FrameData.table);
    this.gameConfigs = resolve(GameConfigData.table);
    this.locks = resolve(LockData.table);
    this.papers = resolve(PaperData.table);
    this.prefabs = resolve(PrefabData.table);
    this.puzzleSlots = resolve(PuzzleSlotData.table);
    this.puzzles = resolve(PuzzleData.table);
    this.roomsA = resolve(RoomAData.table);
    this.roomsB = resolve(RoomBData.table);
    this.soundLinks = resolve(SoundLinkData.table);
    this.sounds = resolve(SoundData.table);
    this.tvs = resolve(TvData.table);
    this.wires = resolve(WireData.table);
    if (store.data !== this.source) throw new Error("CSV data changed while creating game data.");
    Object.freeze(this);
  }
}

function resolveTable<T>(store: CsvDataStore, mapping: CsvTableMapping<T>): readonly T[] {
  const cached = store.tryGetTable(mapping);
  if (cached) return cached;
  if (!store.data?.tryGetDocument(mapping.sheetName)) return Object.freeze([]);
  return store.mapTable(mapping);
}
