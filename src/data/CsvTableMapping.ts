import type { CsvRow } from "../common/csv/CsvDocument";
import { finiteNumber, int32 } from "./validation/CsvValidation";

export class CsvTableMapping<T> {
  constructor(readonly sheetName: string, readonly convert: (row: CsvRow) => T) {
    if (!sheetName.trim()) throw new Error("CSV sheet name is required.");
    Object.freeze(this);
  }
}

// 자료형 변환은 한 경계에서 재사용하며 값의 범위·참조 규칙은 검증기에 둡니다.
export class CsvRowReader {
  constructor(private readonly row: CsvRow, private readonly sheet: string) { }
  text(column: string): string {
    const value = this.row.tryGet(column);
    if (value === undefined) throw this.error(column, "Missing column.");
    return value;
  }
  integer(column: string, allowSign = false): number {
    const value = int32(this.text(column), allowSign);
    if (value === undefined) throw this.error(column, "Expected a 32-bit integer.");
    return value;
  }
  optionalInteger(column: string): number | null {
    return this.text(column) === "" ? null : this.integer(column);
  }
  number(column: string): number {
    const value = finiteNumber(this.text(column));
    if (value === undefined) throw this.error(column, "Expected a finite number.");
    return value;
  }
  optionalNumber(column: string): number | null {
    return this.text(column) === "" ? null : this.number(column);
  }
  flag(column: string): boolean {
    const value = this.text(column);
    if (value === "Y") return true;
    if (value === "N") return false;
    throw this.error(column, "Expected Y or N.");
  }
  list(column: string, dashMeansEmpty = false): readonly string[] {
    const value = this.text(column);
    return Object.freeze(value === "" || (dashMeansEmpty && value === "-") ? [] : value.split(",").map(item => item.trim()));
  }
  idList(column: string, separator: string): readonly number[] {
    const value = this.text(column);
    return Object.freeze(value === "" ? [] : value.split(separator).map(item => {
      const id = int32(item.trim());
      if (id === undefined || id <= 0) throw this.error(column, "Expected positive int32 IDs.");
      return id;
    }));
  }
  private error(column: string, reason: string): Error {
    return new Error(`CSV mapping: ${this.sheet}.csv:${this.row.sourceLine} [${column}] ${reason}`);
  }
}
