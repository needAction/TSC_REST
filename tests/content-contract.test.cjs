const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CsvParser } = require('../dist/common/csv/CsvParser');
const { CsvDataSet } = require('../dist/data/CsvDataSet');
const { CsvValidator } = require('../dist/data/validation/CsvValidator');
const { createGameDataBundle } = require('../dist/data/GameDataBundle');
const root = path.join(__dirname, 'fixtures/content');
const parser = new CsvParser();
const source = () => new Map(fs.readdirSync(root).filter(n => n.endsWith('.csv')).map(n => [n.slice(0, -4), parser.read(fs.readFileSync(path.join(root, n), 'utf8'))]));
function change(docs, sheet, column, value) {
  const doc = docs.get(sheet);
  const quote = v => '"' + v.replaceAll('"', '""') + '"';
  docs.set(sheet, parser.read([doc.headers, ...doc.rows.map((r, i) => doc.headers.map(h => i === 0 && h === column ? value : r.get(h)))].map(r => r.map(quote).join(',')).join('\n')));
}
for (const [sheet, column, value] of [['COMPONENT', 'Script', 'UnknownFeature'], ['COMPONENT', 'Params', 'bad'], ['PUZZLE', 'Type', 'UnknownPuzzle']])
  test('콘텐츠 계약이 실행 전 거부: ' + sheet + '.' + column, () => {
    const docs = source();
    change(docs, sheet, column, value);
    const report = new CsvValidator().validate(new CsvDataSet(docs));
    assert.ok(report.issues.some(i => i.severity === 'Error' && i.sheet === sheet && i.column === column));
  });
test('미등록 초안 CSV는 클라이언트 배포 번들에서 제외한다', () => {
  const docs = source();
  docs.set('DRAFT', parser.read('ID,Value\n1,초안'));
  const bundle = createGameDataBundle(new CsvDataSet(docs));
  assert.ok(!bundle.tables.some(t => t.name === 'DRAFT'));
  assert.ok(bundle.tables.some(t => t.name === 'REGISTRY'));
});
