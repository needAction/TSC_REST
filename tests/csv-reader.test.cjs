const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const cases = require("./fixtures/csv-reader-cases.json");
const { CsvParser } = require("../dist/common/csv/CsvParser");
const { CsvParseError } = require("../dist/common/csv/CsvParseError");
const { CsvLoader } = require("../dist/common/csv/CsvLoader");
const { Utf8CsvFileSource } = require("../dist/infrastructure/data/Utf8CsvFileSource");

const parser = new CsvParser();
for (const fixture of cases) {
  test("CSV 공통 규칙: " + fixture.name, () => {
    if (fixture.error) {
      assert.throws(() => parser.read(fixture.csv, "fixture.csv"), error => {
        assert.ok(error instanceof CsvParseError);
        assert.equal(error.sourceName, "fixture.csv");
        assert.deepEqual([error.code, error.lineNumber, error.fieldNumber], [fixture.error.code, fixture.error.line, fixture.error.field]);
        return true;
      });
    } else {
      const document = parser.read(fixture.csv, "fixture.csv");
      assert.deepEqual(document.headers, fixture.headers);
      assert.deepEqual(document.rows.map(row => document.headers.map(header => row.get(header))), fixture.rows);
      assert.deepEqual(document.rows.map(row => row.sourceLine), fixture.lines);
    }
  });
}

test("CSV 로딩 결과를 소비자가 변경할 수 없고 빈 값과 없는 컬럼을 구분한다", () => {
  const document = parser.read("ColumnA,ColumnB\n,001");
  assert.ok(Object.isFrozen(document) && Object.isFrozen(document.headers) && Object.isFrozen(document.rows));
  assert.throws(() => document.headers.push("other"));
  assert.throws(() => document.rows.pop());
  assert.equal(document.rows[0].tryGet("ColumnA"), "");
  assert.equal(document.rows[0].tryGet("missing"), undefined);
  assert.throws(() => document.rows[0].get("missing"));
  assert.equal(document.rows[0].get("ColumnB"), "001");
});

test("CSV 로더는 주입된 소스를 읽고 취소·형식 오류를 전달한다", async () => {
  let reads = 0;
  const source = {
    readText: async () => {
      reads++;
      return "ColumnA\nvalue";
    }
  };
  const loader = new CsvLoader(source, parser);
  assert.equal((await loader.load("memory.csv")).rows[0].get("ColumnA"), "value");
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(loader.load("memory.csv", cancelled.signal), { name: "AbortError" });
  assert.equal(reads, 1);
  await assert.rejects(loader.load(" "));
  const corrupt = new CsvLoader({ readText: async () => 'ColumnA\n"open' }, parser);
  await assert.rejects(corrupt.load("bad.csv"), error => error instanceof CsvParseError && error.sourceName === "bad.csv");
  let release;
  const pending = new CsvLoader({
    readText: () => new Promise(resolve => {
      release = resolve;
    })
  }, parser);
  const controller = new AbortController();
  const task = pending.load("pending.csv", controller.signal);
  controller.abort();
  release("ColumnA\nvalue");
  await assert.rejects(task, { name: "AbortError" });
});

test("CSV 파일 어댑터는 UTF-8·BOM·한글 경로를 읽고 누락·잘못된 인코딩을 거부한다", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "escape-csv-"));
  const file = path.join(root, "한글 CSV.csv");
  t.after(async () => {
    await fs.unlink(file).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
    await fs.rmdir(root);
  });
  const loader = new CsvLoader(new Utf8CsvFileSource(), parser);
  await fs.writeFile(file, "\ufeffColumnA\r\n한글");
  assert.equal((await loader.load(file)).rows[0].get("ColumnA"), "한글");
  await fs.writeFile(file, "\ufeff\ufeffColumnA\nx");
  assert.equal((await loader.load(file)).headers[0], "\ufeffColumnA");
  await fs.writeFile(file, Buffer.from([0xc3, 0x28]));
  await assert.rejects(loader.load(file));
  await assert.rejects(loader.load(path.join(root, "missing.csv")), { code: "ENOENT" });
});
