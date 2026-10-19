// CSV의 문자열 표기는 경계에서 유지하고, 진행 판정은 이 정책을 재사용합니다.
export const RoomExitRules = Object.freeze({
  SolvedEach: "SolvedEach",
  BothSolved: "BothSolved"
} as const);

export const roomExitRuleNames: readonly string[] = Object.freeze(Object.values(RoomExitRules));

export function requiresBothPuzzles(rule: string): boolean {
  switch (rule) {
    case RoomExitRules.SolvedEach: return false;
    case RoomExitRules.BothSolved: return true;
    default: throw new Error("지원하지 않는 방 탈출 규칙입니다: " + rule);
  }
}
