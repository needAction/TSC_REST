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
    this.interactAnchors = resolveTable(store, AnchorInteractData.table);
    this.nonInteractAnchors = resolveTable(store, AnchorNonInteractData.table);
    this.arrows = resolveTable(store, ArrowData.table);
    this.cards = resolveTable(store, CardData.table);
    this.characterStats = resolveTable(store, CharacterStatData.table);
    this.colorLetters = resolveTable(store, ColorLetterData.table);
    this.components = resolveTable(store, ComponentData.table);
    this.consoles = resolveTable(store, ConsoleData.table);
    this.formulas = resolveTable(store, FormulaData.table);
    this.frames = resolveTable(store, FrameData.table);
    this.gameConfigs = resolveTable(store, GameConfigData.table);
    this.locks = resolveTable(store, LockData.table);
    this.papers = resolveTable(store, PaperData.table);
    this.prefabs = resolveTable(store, PrefabData.table);
    this.puzzleSlots = resolveTable(store, PuzzleSlotData.table);
    this.puzzles = resolveTable(store, PuzzleData.table);
    this.registry = resolveTable(store, RegistryData.table);
    this.roomsA = resolveTable(store, RoomAData.table);
    this.roomsB = resolveTable(store, RoomBData.table);
    this.soundLinks = resolveTable(store, SoundLinkData.table);
    this.sounds = resolveTable(store, SoundData.table);
    this.tvs = resolveTable(store, TvData.table);
    this.wires = resolveTable(store, WireData.table);
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
