import type { PuzzleData } from "../data/tables/PuzzleData";
import type { PuzzleSlotData } from "../data/tables/PuzzleSlotData";

export interface IPuzzleAnswerRule {
  matches(slots: readonly PuzzleSlotData[], answers: readonly string[]): boolean;
}
// 현재 모든 퍼즐은 테이블에 선언된 순서별 정답을 사용합니다. 요청/인증은 이 규칙에 포함하지 않습니다.
export class SlotAnswerRule implements IPuzzleAnswerRule {
  matches(slots: readonly PuzzleSlotData[], answers: readonly string[]): boolean {
    return slots.length === answers.length && slots.every((slot, index) => slot.answer.toUpperCase() === answers[index]!.toUpperCase());
  }
}
export class PuzzleAnswerRules {
  private readonly rules: ReadonlyMap<string, IPuzzleAnswerRule>;
  constructor(rules?: ReadonlyMap<string, IPuzzleAnswerRule>) {
    const slots = new SlotAnswerRule();
    this.rules = rules ?? new Map(["CardLetter", "FrameCount", "ArrowSequence", "WireRank", "TwistedFormula", "TVLetter", "ColourWord"].map(type => [type, slots]));
  }
  evaluate(puzzle: PuzzleData, slots: readonly PuzzleSlotData[], answers: readonly string[]): boolean {
    const rule = this.rules.get(puzzle.type);
    if (!rule) throw new Error("지원하지 않는 퍼즐 판정 규칙: " + puzzle.type);
    return rule.matches(slots, answers);
  }
}
