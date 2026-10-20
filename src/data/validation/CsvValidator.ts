import type { CsvDataSet } from "../CsvDataSet";
import { defaultSchemas, freezeSchemas } from "./CsvSchema";
import type { CsvTableSchema } from "./CsvSchema";
import { CsvValidationContext, CsvValidationReport } from "./CsvValidation";
import type { ICsvValidationRule } from "./CsvValidation";
import { CsvReferenceRule, CsvSchemaRule } from "./CsvTableRules";
import { CsvPuzzleRule, CsvRoomRule, CsvValueRelationRule } from "./CsvGameRules";
import { CsvCharacterStatRule } from "./CharacterStatRule";

// CSV를 다시 읽지 않고 전달받은 메모리 데이터만 검사합니다.
export class CsvValidator {
  readonly #schemas: readonly CsvTableSchema[];
  readonly #rules: readonly ICsvValidationRule[];
  constructor(schemas: readonly CsvTableSchema[] = defaultSchemas, additionalRules: readonly ICsvValidationRule[] = []) {
    this.#schemas = freezeSchemas(schemas);
    this.#rules = Object.freeze([new CsvSchemaRule(), new CsvReferenceRule(), new CsvRoomRule(), new CsvPuzzleRule(), new CsvValueRelationRule(), new CsvCharacterStatRule(), ...additionalRules]);
  }
  validate(data: CsvDataSet, signal?: AbortSignal): CsvValidationReport {
    signal?.throwIfAborted();
    const context = new CsvValidationContext(data, this.#schemas, signal);
    for (const rule of this.#rules) { signal?.throwIfAborted(); rule.validate(context); }
    signal?.throwIfAborted();
    return new CsvValidationReport(data, context.captureIssues());
  }
}
