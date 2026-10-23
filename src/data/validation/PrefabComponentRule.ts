import { int32 } from "./CsvValidation";
import type { CsvValidationContext, ICsvValidationRule } from "./CsvValidation";
import { TableTags } from "./CsvSchema";

// PREFAB.Components는 단일 외래 키가 아니라 | 로 연결한 COMPONENT ID 목록입니다.
export class CsvPrefabComponentRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    const targets = context.tagged(TableTags.component);
    for (const table of context.tagged(TableTags.prefab)) for (const row of table.rows) {
      context.signal?.throwIfAborted();
      const value = row.get("Components");
      if (value === "") continue;
      const seen = new Set<number>();
      for (const token of value.split("|")) {
        const id = int32(token.trim());
        if (id === undefined || id <= 0) {
          context.add("InvalidValue", table.name, row.sourceLine, "Components", token, "positive int32 IDs separated by |");
          continue;
        }
        if (seen.has(id)) context.add("DuplicateKey", table.name, row.sourceLine, "Components", String(id));
        seen.add(id);
        if (!targets.some(target => target.find(String(id)))) context.add("MissingReference", table.name, row.sourceLine, "Components", String(id), "COMPONENT");
      }
    }
  }
}
