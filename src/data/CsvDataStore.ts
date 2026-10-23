import type { CsvDataSet } from "./CsvDataSet";
import type { CsvTableMapping } from "./CsvTableMapping";
import type { CsvValidator } from "./validation/CsvValidator";
import type { CsvValidationReport } from "./validation/CsvValidation";

// 소유자가 생성하여 주입합니다. 전역 저장소나 HTTP 작업 상태는 만들지 않습니다.
export class CsvDataStore {
  #data: CsvDataSet | undefined;
  #validation: CsvValidationReport | undefined;
  #loading: Promise<CsvValidationReport> | undefined;
  readonly #tables = new Map<CsvTableMapping<unknown>, readonly unknown[]>();
  readonly #listeners = new Set<(data: CsvDataSet) => void>();
  get data(): CsvDataSet | undefined {
    return this.#data;
  }
  get validation(): CsvValidationReport | undefined {
    return this.#validation;
  }
  get hasData(): boolean {
    return this.#data !== undefined;
  }
  onRegistered(listener: (data: CsvDataSet) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  // 성공한 최초 등록 이후에는 다시 읽지 않습니다. 동시에 호출해도 같은 로딩 작업을 공유합니다.
  // 최초 호출자의 signal이 실제 로딩 수명을 소유하며 후속 호출의 signal은 자신의 대기만 취소합니다.
  async initialize(load: (signal?: AbortSignal) => Promise<CsvDataSet>, validator: CsvValidator, signal?: AbortSignal): Promise<CsvValidationReport> {
    signal?.throwIfAborted();
    if (this.#validation) return this.#validation;
    if (!this.#loading) this.#loading = this.loadAndRegister(load, validator, signal).finally(() => {
      this.#loading = undefined;
    });
    return waitFor(this.#loading, signal);
  }
  private async loadAndRegister(load: (signal?: AbortSignal) => Promise<CsvDataSet>, validator: CsvValidator, signal?: AbortSignal): Promise<CsvValidationReport> {
    const data = await load(signal);
    signal?.throwIfAborted();
    if (this.#validation) return this.#validation; // 대기 중 직접 등록한 최신 데이터를 보존합니다.
    return this.register(data, validator, signal);
  }
  register(data: CsvDataSet, validator: CsvValidator, signal?: AbortSignal): CsvValidationReport {
    const report = validator.validate(data, signal);
    if (!report.isValid) return report;
    signal?.throwIfAborted();
    if (this.#data === data) {
      this.#validation = report;
      return report;
    }
    this.#data = data;
    this.#validation = report;
    this.#tables.clear();
    for (const listener of [...this.#listeners]) listener(data);
    return report;
  }
  mapTable<T>(mapping: CsvTableMapping<T>): readonly T[] {
    const source = this.#data;
    if (!source) throw new Error("Register valid CSV data before mapping tables.");
    if (this.#tables.has(mapping)) throw new Error("CSV table mapping is already registered: " + mapping.sheetName);
    const converted = Object.freeze(source.getDocument(mapping.sheetName).rows.map(mapping.convert));
    if (this.#data !== source) throw new Error("CSV data changed during mapping.");
    this.#tables.set(mapping, converted);
    return converted;
  }
  tryGetTable<T>(mapping: CsvTableMapping<T>): readonly T[] | undefined {
    return this.#tables.get(mapping) as readonly T[] | undefined;
  }
  getTable<T>(mapping: CsvTableMapping<T>): readonly T[] {
    const table = this.tryGetTable(mapping);
    if (!table) throw new Error("CSV table mapping is not registered: " + mapping.sheetName);
    return table;
  }
}

function waitFor<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    task.then(value => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
  });
}
