import { finiteNumber } from "./CsvValidation";
import type { CsvValidationContext, ICsvValidationRule } from "./CsvValidation";
import { TableTags } from "./CsvSchema";

// Unity 행 모델과 동일하게 float32에서 정수 milli 단위로 정규화하여 검사합니다.
export class CsvCharacterStatRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    for (const table of context.tagged(TableTags.characterStat)) for (const row of table.rows) {
      context.signal?.throwIfAborted();
      const values = new Map<string, number>();
      const fields = ["WalkSpeed", "Acceleration", "Deceleration", "EyeHeight", "CapsuleHeight", "CapsuleRadius", "StepOffset", "FOV"];
      let invalid = false;
      for (const field of fields) {
        const raw = finiteNumber(row.get(field));
        const scaled = raw === undefined ? NaN : Math.round(Math.fround(raw) * 1000);
        if (!Number.isFinite(scaled) || scaled < -2147483648 || scaled > 2147483647) {
          context.add("InvalidValue", table.name, row.sourceLine, field, row.get(field), "int32 milli units");
          invalid = true;
        } else values.set(field, scaled);
      }
      if (invalid) continue;
      for (const field of ["MouseSensitivity", "PitchLimit", "InteractDistance", "HeadBob"]) {
        const raw = finiteNumber(row.get(field));
        if (raw === undefined || !Number.isFinite(Math.fround(raw)))
          context.add("InvalidValue", table.name, row.sourceLine, field, row.get(field), "finite float32");
      }
      const get = (field: string) => values.get(field)!;
      const check = (field: string, valid: boolean, rule: string) => {
        if (!valid) context.add("InvalidValue", table.name, row.sourceLine, field, row.get(field), rule);
      };
      check("WalkSpeed", get("WalkSpeed") > 0 && get("WalkSpeed") <= 100000, "1..100000 mm/s");
      for (const field of ["Acceleration", "Deceleration"])
        check(field, get(field) > 0 && get(field) <= 1000000, "1..1000000 mm/s2");
      check("EyeHeight", get("EyeHeight") > 0 && get("EyeHeight") < get("CapsuleHeight"), "0 < eye < capsule height");
      check("CapsuleRadius", get("CapsuleRadius") > 0, "positive radius");
      check("CapsuleHeight", get("CapsuleHeight") >= 2 * get("CapsuleRadius"), "height >= 2 * radius");
      check("StepOffset", get("StepOffset") >= 0 && get("StepOffset") < get("CapsuleHeight"), "0 <= step < height");
      check("FOV", get("FOV") > 0 && get("FOV") < 179000, "0 < FOV < 179 degrees");
    }
  }
}
