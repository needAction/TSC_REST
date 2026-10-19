import type { CsvDataSet } from "../CsvDataSet";
import type { CsvDocument, CsvRow } from "../../common/csv/CsvDocument";
import type { CsvTableSchema } from "./CsvSchema";

export type CsvValidationSeverity = "Error" | "Warning";
export type CsvValidationCode = "ReadFailed" | "ParseError" | "UnknownSchema" | "MissingColumn" | "UnknownColumn" |
  "EmptyTable" | "EmptyValue" | "Whitespace" | "InvalidValue" | "DuplicateKey" | "MissingRegistry" |
  "MissingTable" | "UnknownSheet" | "MissingReference" | "InactiveReference" | "UnregisteredTable" |
  "RoomMissing" | "RoomCycle" | "RoomStartCount" | "RoomDisconnected" | "SlotCount" | "SlotRange" | "PuzzleRoom" | "InputRoom" | "ConsoleSlots" |
  "InvalidDistance" | "InvalidLetters";

export class CsvValidationIssue {
  readonly details: readonly string[];
  constructor(readonly code: CsvValidationCode, readonly sheet: string, readonly line: number, readonly column: string,
    readonly severity: CsvValidationSeverity = "Error", details: readonly string[] = []) {
    this.details = Object.freeze([...details]);
    Object.freeze(this);
  }
  toString(): string { return `[${this.severity}] ${this.sheet}.csv:${this.line} [${this.column}] ${this.code} ${this.details.join(", ")}`; }
}

export class CsvValidationReport {
  readonly issues: readonly CsvValidationIssue[];
  readonly errorCount: number;
  constructor(readonly data: CsvDataSet, issues: readonly CsvValidationIssue[]) {
    this.issues = Object.freeze([...issues]);
    this.errorCount = issues.filter(issue => issue.severity === "Error").length;
    Object.freeze(this);
  }
  get fileCount(): number { return this.data.fileCount; }
  get warningCount(): number { return this.issues.length - this.errorCount; }
  get isValid(): boolean { return this.errorCount === 0; }
}

export interface ICsvValidationRule { validate(context: CsvValidationContext): void; }

export class CsvValidationTable {
  readonly usable: boolean;
  readonly key: string | undefined;
  readonly #index = new Map<string, CsvRow>();
  constructor(readonly name: string, readonly document: CsvDocument, readonly schema?: CsvTableSchema) {
    this.usable = schema === undefined || schema.columns.every(column => document.headers.includes(column.name));
    this.key = schema?.key ?? (document.headers.includes("ID") ? "ID" : undefined);
    if (this.usable && this.key !== undefined) for (const row of document.rows) {
      const key = row.get(this.key);
      if (!this.#index.has(key)) this.#index.set(key, row);
    }
    Object.freeze(this);
  }
  get rows(): readonly CsvRow[] { return this.usable ? this.document.rows : []; }
  find(key: string): CsvRow | undefined { return this.#index.get(key); }
}

// 한 번의 검증에만 사용하는 작업 공간입니다. 이전 검증 상태나 I/O를 소유하지 않습니다.
export class CsvValidationContext {
  readonly tables: readonly CsvValidationTable[];
  readonly #issues: CsvValidationIssue[];
  constructor(data: CsvDataSet, readonly schemas: readonly CsvTableSchema[], readonly signal?: AbortSignal) {
    this.tables = Object.freeze([...data.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, document]) => new CsvValidationTable(name, document, schemas.find(schema => schema.name === name))));
    this.#issues = [...data.loadIssues];
  }
  tagged(tag: string): CsvValidationTable[] { return this.tables.filter(table => table.usable && table.schema?.tag === tag); }
  find(name: string): CsvValidationTable | undefined { return this.tables.find(table => table.name === name && table.usable); }
  captureIssues(): readonly CsvValidationIssue[] { return Object.freeze([...this.#issues]); }
  add(code: CsvValidationCode, table: string, line: number, column: string, ...details: string[]): void {
    this.#issues.push(new CsvValidationIssue(code, table, line, column, "Error", details));
  }
  warn(code: CsvValidationCode, table: string, line: number, column: string, ...details: string[]): void {
    this.#issues.push(new CsvValidationIssue(code, table, line, column, "Warning", details));
  }
  reference(table: CsvValidationTable, row: CsvRow, column: string, targets: readonly CsvValidationTable[], sentinel?: string): void {
    const value = row.get(column);
    if (!value || value === sentinel) return;
    const match = targets.map(target => target.find(value)).find(target => target !== undefined);
    if (match === undefined) this.add("MissingReference", table.name, row.sourceLine, column, value, targets.map(target => target.name).join(", "));
    else if (isActive(row) && !isActive(match)) this.warn("InactiveReference", table.name, row.sourceLine, column, value);
  }
}

export function isActive(row: CsvRow): boolean { return row.tryGet("Active") === undefined || row.get("Active") === "Y"; }
export function csvList(value: string): string[] { return value === "-" || value === "" ? [] : value.split(",").map(item => item.trim()); }
export function finiteNumber(value: string): number | undefined {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
export function int32(value: string, allowSign = false): number | undefined {
  const text = allowSign ? value.trim() : value;
  if (!(allowSign ? /^[+-]?\d+$/ : /^\d+$/).test(text)) return undefined;
  const number = Number(text);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : undefined;
}
