export class CsvRow {
  readonly #values: Map<string, string>;

  constructor(readonly sourceLine: number, headers: readonly string[], values: readonly string[]) {
    this.#values = new Map(headers.map((header, index) => [header, values[index]]));
    Object.freeze(this);
  }

  get(columnName: string): string {
    const value = this.#values.get(columnName);
    if (value === undefined) throw new Error(`CSV 컬럼이 없습니다: ${columnName}`);
    return value;
  }

  tryGet(columnName: string): string | undefined { return this.#values.get(columnName); }
}

// 컬럼과 셀은 읽기 전용입니다. 숫자 변환이나 ID 규칙은 콘텐츠 정의 단계에서 결정합니다.
export class CsvDocument {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];

  constructor(readonly sourceName: string, headers: readonly string[], rows: readonly CsvRow[]) {
    this.headers = Object.freeze([...headers]);
    this.rows = Object.freeze([...rows]);
    Object.freeze(this);
  }
}
