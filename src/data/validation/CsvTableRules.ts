import { TableTags } from "./CsvSchema";
import type { CsvColumnSchema } from "./CsvSchema";
import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvValidationContext, csvList, finiteNumber, int32, isActive } from "./CsvValidation";
import type { ICsvValidationRule, CsvValidationTable } from "./CsvValidation";

export class CsvSchemaRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    for (const table of context.tables) {
      context.signal?.throwIfAborted();
      if (!table.schema) context.warn("UnknownSchema", table.name, 1, "");
      else {
        const expected = table.schema.columns.map(column => column.name);
        for (const column of expected) if (!table.document.headers.includes(column)) context.add("MissingColumn", table.name, 1, column);
        for (const column of table.document.headers) if (!expected.includes(column)) context.warn("UnknownColumn", table.name, 1, column);
      }
      if (!table.usable) continue;
      if (table.rows.length === 0) context.warn("EmptyTable", table.name, 1, "");
      if (table.key) checkUnique(context, table, [table.key]);
      if (!table.schema) continue;
      for (const key of table.schema.uniqueKeys ?? []) checkUnique(context, table, key);
      for (const row of table.rows) {
        context.signal?.throwIfAborted();
        for (const column of table.schema.columns) this.checkCell(context, table, row, column);
      }
    }
    const groups = new Map<string, Set<string>>();
    for (const table of context.tables) {
      if (!table.usable || !table.schema?.keyGroup || !table.key) continue;
      const keys = groups.get(table.schema.keyGroup) ?? new Set<string>();
      groups.set(table.schema.keyGroup, keys);
      for (const row of table.rows) {
        const key = row.get(table.key);
        if (keys.has(key)) context.add("DuplicateKey", table.name, row.sourceLine, table.key, key, table.schema.keyGroup);
        keys.add(key);
      }
    }
  }
  private checkCell(context: CsvValidationContext, table: CsvValidationTable, row: CsvRow, column: CsvColumnSchema): void {
    const value = row.get(column.name);
    if (value.length === 0) {
      if (!column.optional) context.add("EmptyValue", table.name, row.sourceLine, column.name);
      return;
    }
    if (value !== value.trim()) context.warn("Whitespace", table.name, row.sourceLine, column.name);
    const number = column.kind === "integer" ? int32(value) : column.kind === "number" ? finiteNumber(value) : undefined;
    let valid = column.kind === "text" || number !== undefined;
    if (number !== undefined && ((column.min !== undefined && number < column.min) || (column.max !== undefined && number > column.max))) valid = false;
    if (column.values?.length && !column.values.includes(value)) valid = false;
    if (!valid) context.add("InvalidValue", table.name, row.sourceLine, column.name, value, column.kind);
  }
}

export function checkUnique(context: CsvValidationContext, table: CsvValidationTable, columns: readonly string[]): void {
  const keys = new Set<string>();
  for (const row of table.rows) {
    const key = JSON.stringify(columns.map(column => row.get(column)));
    if (keys.has(key)) context.add("DuplicateKey", table.name, row.sourceLine, columns.join(","), key);
    keys.add(key);
  }
}

export class CsvReferenceRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    for (const table of context.tables) {
      if (!table.usable || !table.schema) continue;
      for (const reference of table.schema.references ?? []) {
        let targets = reference.target === "$self" ? [table] : context.tagged(reference.target);
        if (reference.targetKind) targets = targets.filter(target => target.schema?.kind === reference.targetKind);
        for (const row of table.rows) {
          context.signal?.throwIfAborted();
          context.reference(table, row, reference.column, targets, reference.sentinel);
        }
      }
    }
    const registry = context.tagged(TableTags.registry)[0];
    if (!registry) {
      context.add("MissingRegistry", context.schemas.find(schema => schema.tag === TableTags.registry)!.name, 1, "");
      return;
    }
    const names = new Set(registry.rows.map(row => row.get("Sheet")));
    checkUnique(context, registry, ["Sheet"]);
    for (const row of registry.rows) {
      context.signal?.throwIfAborted();
      const name = row.get("Sheet"), table = context.find(name);
      if (isActive(row) && !table) {
        if (row.get("Required") === "Y") context.add("MissingTable", registry.name, row.sourceLine, "Sheet", name);
        else context.warn("MissingTable", registry.name, row.sourceLine, "Sheet", name);
      }
      for (const target of [...csvList(row.get("Parent")), ...csvList(row.get("Uses"))])
        if (!names.has(target)) context.add("UnknownSheet", registry.name, row.sourceLine, "Parent/Uses", target);
      if (!table) continue;
      const keys = csvList(row.get("ParentKey"));
      for (const key of keys) if (!table.document.headers.includes(key)) context.add("MissingColumn", registry.name, row.sourceLine, "ParentKey", name, key);
      if (keys.length !== 1 || !table.document.headers.includes(keys[0])) continue;
      const parents = csvList(row.get("Parent")).map(name => context.find(name)).filter((value): value is CsvValidationTable => value !== undefined);
      for (const child of table.rows) context.reference(table, child, keys[0], parents);
    }
    for (const table of context.tables) if (!names.has(table.name)) context.warn("UnregisteredTable", table.name, 1, "");
  }
}
