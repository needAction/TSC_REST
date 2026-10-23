import { contentContract } from "../ContentContract";
import type { CsvValidationContext, ICsvValidationRule } from "./CsvValidation";

// 런타임 조립 전에 기능 이름·매개변수·조합을 검증합니다. 엔진 객체 검사는 클라이언트 어댑터가 담당합니다.
export class ContentFeatureRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    const components = context.find("COMPONENT");
    if (components) for (const row of components.rows) {
      const script = row.get("Script"), raw = row.get("Params");
      const invalid = (column: string, message: string) => context.add("InvalidValue", components.name, row.sourceLine, column, message);
      if (!(contentContract.features as readonly string[]).includes(script)) {
        invalid("Script", "미지원 기능: " + script);
        continue;
      }
      const required = (contentContract.parameters as Readonly<Record<string, readonly string[]>>)[script]?.[0] ?? null;
      if (!required) {
        if (raw !== "-" && raw !== "") invalid("Params", "매개변수가 없는 기능은 -를 사용합니다.");
        continue;
      }
      const parts = raw.split("=");
      if (parts.length !== 2 || parts[0]!.trim() !== required) {
        invalid("Params", required + "=값 형식이 필요합니다.");
        continue;
      }
      const value = parts[1]!.trim();
      if (required === "HighlightColor") {
        if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) && !(contentContract.colors as readonly string[]).includes(value.toLowerCase())) invalid("Params", "지원하는 색 이름 또는 #RRGGBB[AA]가 필요합니다.");
      } else {
        const tokens = value.split(',');
        const numbers = tokens.map(n => /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(n.trim()) ? Number(n) : NaN);
        if (numbers.length !== 3 || numbers.some(n => !Number.isFinite(n) || Math.abs(n) > 100) || numbers.every(n => Math.round(Math.abs(n) * 1000) === 0)) invalid("Params", "CamOffset은 ±100m 이내의 0이 아닌 x,y,z입니다.");
      }
    }
    const puzzles = context.find("PUZZLE");
    if (puzzles) for (const row of puzzles.rows)
      if (!(contentContract.puzzleTypes as readonly string[]).includes(row.get("Type"))) context.add("InvalidValue", puzzles.name, row.sourceLine, "Type", row.get("Type"), "미지원 퍼즐 종류");
    const prefabs = context.find("PREFAB");
    if (components && prefabs) for (const row of prefabs.rows) {
      const names = row.get("Components").split('|').map(id => components.find(id.trim())?.get("Script")).filter(Boolean);
      const fail = (text: string) => context.add("InvalidValue", prefabs.name, row.sourceLine, "Components", text);
      if (new Set(names).size !== names.length) fail("같은 기능을 중복 선언했습니다.");
      if (names.some(n => ["CloseUpUI", "DialLock", "ButtonConsole", "Door"].includes(n!)) && !names.includes("Interactable")) fail("Interactable이 필요합니다.");
      if (names.some(n => n === "DialLock" || n === "ButtonConsole") && !names.includes("CloseUpUI")) fail("CloseUpUI가 필요합니다.");
      if (names.includes("DialLock") && names.includes("ButtonConsole")) fail("DialLock과 ButtonConsole은 함께 사용할 수 없습니다.");
    }
  }
}
