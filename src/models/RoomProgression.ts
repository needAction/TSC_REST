import type { CsvGameData } from "../data/tables/CsvGameData";
import type { PlayerRole } from "./GameSession";

// 방의 해금은 누적 상태입니다. 다음 방을 열어도 이전 방을 목록에서 제거하지 않습니다.
export class RoomProgression {
  private readonly unlocked = new Set<number>();
  private readonly solved = new Set<number>();
  constructor(private readonly data: CsvGameData) { this.reset(); }

  reset(): void {
    this.solved.clear(); this.unlocked.clear();
    for (const rooms of [this.data.roomsA, this.data.roomsB]) {
      const active = rooms.filter(room => room.active);
      const first = active.find(room => !active.some(other => other.next === room.id));
      if (!first) throw new Error("ROOM 시작 행을 찾을 수 없습니다.");
      this.unlocked.add(first.id);
    }
  }
  get unlockedRoomIds(): readonly number[] { return [...this.unlocked].sort((a, b) => a - b); }

  submit(role: PlayerRole, puzzleId: number, answers: readonly string[]): { accepted: boolean; correct: boolean } {
    const puzzle = this.data.puzzles.find(row => row.id === puzzleId && row.active);
    const rooms = role === "A" ? this.data.roomsA : this.data.roomsB;
    if (!puzzle || !rooms.some(room => room.id === puzzle.solverRoom && room.active && this.unlocked.has(room.id)))
      return { accepted: false, correct: false };
    const slots = this.data.puzzleSlots.filter(slot => slot.puzzleId === puzzleId).sort((a, b) => a.slot - b.slot);
    const correct = answers.length === slots.length && slots.every((slot, index) => slot.answer.toUpperCase() === answers[index].toUpperCase());
    if (!correct) return { accepted: true, correct: false };
    this.solved.add(puzzleId);
    for (const room of [...this.data.roomsA, ...this.data.roomsB]) {
      if (!room.active || !this.unlocked.has(room.id)) continue;
      const required = room.exitRule === "BothSolved"
        ? [...this.data.roomsA, ...this.data.roomsB].filter(other => other.active && other.roomNo === room.roomNo)
        : [room];
      if (required.every(other => this.solved.has(other.puzzleId)) && room.next !== 0) this.unlocked.add(room.next);
    }
    return { accepted: true, correct: true };
  }
}
