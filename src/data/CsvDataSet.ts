import type { CsvDocument } from "../common/csv/CsvDocument";
import { CsvErrorCode, CsvParseError } from "../common/csv/CsvParseError";
import type { CsvLoader } from "../common/csv/CsvLoader";
import { CsvValidationIssue } from "./validation/CsvValidation";

export class CsvDataSet {
  readonly #documents: Map<string, CsvDocument>;
  readonly loadIssues: readonly CsvValidationIssue[];
  readonly fileCount: number;
  constructor(documents: Iterable<readonly [string, CsvDocument]>, issues: readonly CsvValidationIssue[] = [], fileCount?: number) {
    this.#documents = new Map();
    for (const [name, document] of documents) {
      if (!name.trim() || this.#documents.has(name) || !document) throw new Error("Empty or duplicate CSV table: " + name);
      this.#documents.set(name, document);
    }
    this.fileCount = fileCount ?? this.#documents.size;
    if (!Number.isInteger(this.fileCount) || this.fileCount < this.#documents.size) throw new Error("Invalid CSV file count.");
    this.loadIssues = Object.freeze([...issues]);
    Object.freeze(this);
  }
  entries(): IterableIterator<[string, CsvDocument]> { return this.#documents.entries(); }
  tryGetDocument(sheet: string): CsvDocument | undefined { return this.#documents.get(sheet); }
  getDocument(sheet: string): CsvDocument {
    const document = this.tryGetDocument(sheet);
    if (!document) throw new Error("CSV table not loaded: " + sheet);
    return document;
  }
  static async load(sources: Iterable<readonly [string, string]>, loader: CsvLoader, signal?: AbortSignal): Promise<CsvDataSet> {
    const documents = new Map<string, CsvDocument>();
    const issues: CsvValidationIssue[] = [];
    const names = new Set<string>();
    let count = 0;
    for (const [sheet, location] of [...sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      signal?.throwIfAborted();
      if (!sheet.trim() || names.has(sheet)) throw new Error("Empty or duplicate CSV table: " + sheet);
      names.add(sheet); count++;
      try { documents.set(sheet, await loader.load(location, signal)); }
      catch (error) {
        signal?.throwIfAborted();
        if (error instanceof CsvParseError) issues.push(new CsvValidationIssue("ParseError", sheet, error.lineNumber, String(error.fieldNumber), "Error", [CsvErrorCode[error.code]]));
        else if (error instanceof Error && "code" in error && typeof error.code === "string")
          issues.push(new CsvValidationIssue("ReadFailed", sheet, 1, "", "Error", [error.name, error.message]));
        else throw error;
      }
    }
    signal?.throwIfAborted();
    return new CsvDataSet(documents, issues, count);
  }
}
