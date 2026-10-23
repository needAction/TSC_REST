import type { CsvGameData } from "../data/tables/CsvGameData";
import type { PlayerRole } from "./GameSession";
import { requiresBothPuzzles } from "../data/RoomExitRules";
import { PuzzleAnswerRules } from "./PuzzleAnswerRules";
import type { RoomData } from "../data/tables/RoomData";

// 방의 해금은 누적 상태입니다. 다음 방을 열어도 이전 방을 목록에서 제거하지 않습니다.
export class RoomProgression {
  private readonly unlocked = new Set<number>();
  private readonly solved = new Set<number>();
  private readonly permitted = new Set<number>();
  constructor(private readonly data: CsvGameData, private readonly answerRules = new PuzzleAnswerRules()) {
    this.reset();
  }

  reset(): void {
    this.solved.clear();
    this.unlocked.clear();
    this.permitted.clear();
    for (const rooms of [this.data.roomsA, this.data.roomsB]) {
      const active = rooms.filter(room => room.active);
      const starts = active.filter(room => !active.some(other => other.next === room.id));
      if (starts.length !== 1) throw new Error("활성 ROOM 시작 행은 정확히 하나여야 합니다.");
      this.unlocked.add(starts[0]!.id);
    }
  }
  get unlockedRoomIds(): readonly number[] {
    return [...this.unlocked].sort((a, b) => a - b);
  }

  submit(role: PlayerRole, puzzleId: number, answers: readonly string[]): {
    accepted: boolean;
    correct: boolean
  } {
    const puzzle = this.data.puzzles.find(row => row.id === puzzleId && row.active);
    const rooms = role === "A" ? this.data.roomsA : this.data.roomsB;
    if (!puzzle || !rooms.some(room => room.id === puzzle.solverRoom && room.active && this.unlocked.has(room.id)))
      return { accepted: false, correct: false };
    const slots = this.data.puzzleSlots.filter(slot => slot.puzzleId === puzzleId).sort((a, b) => a.slot - b.slot);
    const correct = this.answerRules.evaluate(puzzle, slots, answers);
    if (!correct) return { accepted: true, correct: false };
    this.solved.add(puzzleId);
    const room = rooms.find(room => room.id === puzzle.solverRoom)!;
    this.checkDoor(role, room.roomNo);
    return { accepted: true, correct: true };
  }
  findRoom(role: PlayerRole, roomNo: number): RoomData | undefined {
    return (role === "A" ? this.data.roomsA : this.data.roomsB).find(room => room.active && room.roomNo === roomNo);
  }
  isDoorPermitted(role: PlayerRole, roomNo: number): boolean {
    const room = this.findRoom(role, roomNo);
    return room !== undefined && this.permitted.has(room.id);
  }
  checkDoor(role: PlayerRole, roomNo: number): boolean {
    const room = this.findRoom(role, roomNo);
    if (!room || !this.unlocked.has(room.id)) return false;
    if (this.permitted.has(room.id)) return true;
    const required = requiresBothPuzzles(room.exitRule)
      ? [...this.data.roomsA, ...this.data.roomsB].filter(other => other.active && other.roomNo === room.roomNo) : [room];
    if (!required.every(other => this.solved.has(other.puzzleId))) return false;
    this.permitted.add(room.id);
    if (room.next !== 0) this.unlocked.add(room.next);
    return true;
  }
}
