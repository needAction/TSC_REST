"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { CsvParser } = require("../dist/common/csv/CsvParser");
const { CsvLoader } = require("../dist/common/csv/CsvLoader");
const { CsvDataSet } = require("../dist/data/CsvDataSet");
const { CsvDataStore } = require("../dist/data/CsvDataStore");
const { CsvTableMapping } = require("../dist/data/CsvTableMapping");
const { CsvValidator } = require("../dist/data/validation/CsvValidator");
const { defaultSchemas } = require("../dist/data/validation/CsvSchema");
const { CsvGameData } = require("../dist/data/tables/CsvGameData");
const { PuzzleData } = require("../dist/data/tables/PuzzleData");
const { GameConfigData } = require("../dist/data/tables/GameConfigData");
const { readCsvDirectory, loadGameData } = require("../dist/infrastructure/data/loadGameData");
const { Utf8CsvFileSource } = require("../dist/infrastructure/data/Utf8CsvFileSource");

const folder = path.resolve(__dirname, "../data");
const validator = new CsvValidator();
const parser = new CsvParser();
const originals = fs.readdir(folder).then(async files => Object.fromEntries(await Promise.all(files.filter(file => file.toLowerCase().endsWith(".csv"))
  .map(async file => [path.basename(file, path.extname(file)), await fs.readFile(path.join(folder, file), "utf8")]))));
async function memory(sources) {
  return CsvDataSet.load(Object.keys(sources).map(name => [name, name]), new CsvLoader({ readText: async name => sources[name] }, parser));
}
function cell(sources, sheet, index, column, value) {
  const document = parser.read(sources[sheet]);
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  sources[sheet] = document.headers.map(quote).join(",") + "\n" + document.rows.map((row, i) =>
    document.headers.map(header => quote(i === index && header === column ? value : row.get(header))).join(",")).join("\n");
}
const at = (sheet, column, code) => issue => issue.sheet === sheet && issue.column === column && issue.severity === "Error" && (!code || issue.code === code);
const checks = [
  ["프리팹 기능 ID 참조", x => cell(x, "PREFAB", 1, "Components", "99999"), at("PREFAB", "Components", "MissingReference")],
  ["프리팹 기능 ID 중복", x => cell(x, "PREFAB", 1, "Components", "14001|14001"), at("PREFAB", "Components", "DuplicateKey")],
  ["프리팹 기능 ID 형식", x => cell(x, "PREFAB", 1, "Components", "14001||14005"), at("PREFAB", "Components", "InvalidValue")],
  ["마우스 감도 0 거부", x => cell(x, "CHARACTER_STAT", 0, "MouseSensitivity", "0"), at("CHARACTER_STAT", "MouseSensitivity", "InvalidValue")],
  ["마우스 감도 정수 범위", x => cell(x, "CHARACTER_STAT", 0, "MouseSensitivity", "101"), at("CHARACTER_STAT", "MouseSensitivity", "InvalidValue")],
  ["시점 상하 회전 범위", x => cell(x, "CHARACTER_STAT", 0, "PitchLimit", "90"), at("CHARACTER_STAT", "PitchLimit", "InvalidValue")],
  ["캐릭터 정지 속도 거부", x => cell(x, "CHARACTER_STAT", 0, "WalkSpeed", "0"), at("CHARACTER_STAT", "WalkSpeed", "InvalidValue")],
  ["캐릭터 가속도 0 거부", x => cell(x, "CHARACTER_STAT", 0, "Acceleration", "0"), at("CHARACTER_STAT", "Acceleration", "InvalidValue")],
  ["캐릭터 감속도 0 거부", x => cell(x, "CHARACTER_STAT", 0, "Deceleration", "0"), at("CHARACTER_STAT", "Deceleration", "InvalidValue")],
  ["캐릭터 고정소수점 속도 범위", x => cell(x, "CHARACTER_STAT", 0, "WalkSpeed", "1000"), at("CHARACTER_STAT", "WalkSpeed", "InvalidValue")],
  ["캐릭터 눈높이 관계", x => cell(x, "CHARACTER_STAT", 0, "EyeHeight", "2"), at("CHARACTER_STAT", "EyeHeight", "InvalidValue")],
  ["캐릭터 캡슐 지름 관계", x => cell(x, "CHARACTER_STAT", 0, "CapsuleRadius", "1"), at("CHARACTER_STAT", "CapsuleHeight", "InvalidValue")],
  ["캐릭터 단차 관계", x => cell(x, "CHARACTER_STAT", 0, "StepOffset", "1.8"), at("CHARACTER_STAT", "StepOffset", "InvalidValue")],
  ["캐릭터 시야각 상한", x => cell(x, "CHARACTER_STAT", 0, "FOV", "179"), at("CHARACTER_STAT", "FOV", "InvalidValue")],
  ["캐릭터 float32 초과", x => cell(x, "CHARACTER_STAT", 0, "WalkSpeed", "1e100"), at("CHARACTER_STAT", "WalkSpeed", "InvalidValue")],
  ["ID 중복", x => cell(x, "CARD", 1, "ID", "3001"), at("CARD", "ID", "DuplicateKey")],
  ["필수 헤더", x => x.CARD = x.CARD.replace('"TopMark"', '"Typo"'), at("CARD", "TopMark", "MissingColumn")],
  ["따옴표 문법", x => x.CARD += '\n"unclosed', issue => issue.sheet === "CARD" && issue.details.includes("UnclosedQuote")],
  ["행 컬럼 수", x => x.CARD += "\n1,2", issue => issue.sheet === "CARD" && issue.details.includes("FieldCountMismatch")],
  ["Y/N 형식", x => cell(x, "CARD", 0, "IsAnswer", "yes"), at("CARD", "IsAnswer", "InvalidValue")],
  ["필수 값", x => cell(x, "CARD", 0, "TopMark", ""), at("CARD", "TopMark", "EmptyValue")],
  ["정수 형식", x => cell(x, "CARD", 0, "CardNo", "1.5"), at("CARD", "CardNo", "InvalidValue")],
  ["정수 범위", x => cell(x, "CARD", 0, "ID", "2147483648"), at("CARD", "ID", "InvalidValue")],
  ["무한대 거부", x => cell(x, "WIRE", 0, "LengthM", "Infinity"), at("WIRE", "LengthM", "InvalidValue")],
  ["NaN 거부", x => cell(x, "WIRE", 0, "LengthM", "NaN"), at("WIRE", "LengthM", "InvalidValue")],
  ["16진수 거부", x => cell(x, "WIRE", 0, "LengthM", "0x10"), at("WIRE", "LengthM", "InvalidValue")],
  ["설정 자료형", x => cell(x, "GAME_CONFIG", 0, "Value", "abc"), at("GAME_CONFIG", "Value", "InvalidValue")],
  ["프리팹 참조", x => cell(x, "ANCHOR_INTERACT", 0, "PrefabID", "99999"), at("ANCHOR_INTERACT", "PrefabID", "MissingReference")],
  ["앵커 부모 종류", x => cell(x, "ARROW", 0, "AnchorRef", "2030"), at("ARROW", "AnchorRef", "MissingReference")],
  ["필수 시트 누락", x => delete x.LOCK, issue => issue.sheet === "REGISTRY" && issue.code === "MissingTable" && issue.details.includes("LOCK")],
  ["퍼즐 참조", x => cell(x, "PUZZLE_SLOT", 0, "PuzzleID", "99999"), at("PUZZLE_SLOT", "PuzzleID", "MissingReference")],
  ["슬롯 개수", x => cell(x, "PUZZLE", 0, "SlotCount", "5"), at("PUZZLE", "SlotCount", "SlotCount")],
  ["슬롯 중복", x => cell(x, "PUZZLE_SLOT", 1, "Slot", "1"), at("PUZZLE_SLOT", "PuzzleID,Slot", "DuplicateKey")],
  ["슬롯 범위", x => cell(x, "PUZZLE_SLOT", 0, "Slot", "99"), at("PUZZLE_SLOT", "Slot", "SlotRange")],
  ["입력 방 일치", x => cell(x, "PUZZLE", 0, "InputAnchor", "2034"), at("PUZZLE", "InputAnchor", "InputRoom")],
  ["사운드 전역 대상", x => cell(x, "SOUND_LINK", 0, "TargetID", "1"), at("SOUND_LINK", "TargetID", "InvalidValue")],
  ["사운드 참조", x => cell(x, "SOUND_LINK", 0, "SoundID", "99999"), at("SOUND_LINK", "SoundID", "MissingReference")],
  ["다음 방 플레이어", x => cell(x, "ROOM_A", 0, "Next", "1002"), at("ROOM_A", "Next", "MissingReference")],
  ["다음 방 순환", x => cell(x, "ROOM_A", 1, "Next", "1001"), at("ROOM_A", "Next", "RoomCycle")],
  ["활성 방 시작점 분리", x => cell(x, "ROOM_A", 0, "Next", "0"), at("ROOM_A", "Next", "RoomStartCount")],
  ["활성 방 없는 시작점", x => {
    const count = parser.read(x.ROOM_A).rows.length;
    for (let i = 0; i < count; i++) cell(x, "ROOM_A", i, "Active", "N");
  }, at("ROOM_A", "Next", "RoomStartCount")],
  ["단일 시작점 밖의 순환", x => {
    cell(x, "ROOM_A", 0, "Next", "0");
    cell(x, "ROOM_A", 6, "Next", "1003");
  }, at("ROOM_A", "Next", "RoomDisconnected")],
  ["비활성 중간 방으로 시작점 분리", x => cell(x, "ROOM_A", 1, "Active", "N"), at("ROOM_A", "Next", "RoomStartCount")],
  ["비활성 마지막 방으로 단절", x => cell(x, "ROOM_A", 6, "Active", "N"), at("ROOM_A", "Next", "RoomDisconnected")],
  ["미지원 탈출 규칙", x => cell(x, "ROOM_A", 0, "ExitRule", "BothSolvd"), at("ROOM_A", "ExitRule", "InvalidValue")],
  ["공통 앵커 방", x => cell(x, "ANCHOR_INTERACT", 0, "RoomNo", "99"), at("ANCHOR_INTERACT", "RoomNo", "RoomMissing")],
  ["음량 범위", x => cell(x, "SOUND", 0, "Volume", "2"), at("SOUND", "Volume", "InvalidValue")],
  ["거리 범위", x => cell(x, "SOUND", 1, "MinDist", "9"), at("SOUND", "MaxDist", "InvalidDistance")],
  ["REGISTRY 손상", x => x.REGISTRY = "ID\n1", at("REGISTRY", "Sheet", "MissingColumn")],
  ["방 ID 공간", x => cell(x, "ROOM_B", 0, "ID", "1001"), at("ROOM_B", "ID", "DuplicateKey")],
  ["앵커 ID 공간", x => cell(x, "ANCHOR_NONINTERACT", 0, "ID", "2002"), at("ANCHOR_NONINTERACT", "ID", "DuplicateKey")],
  ["Letter9 문자", x => cell(x, "LOCK", 4, "DialLetters", "A,A,A,A,A,A,A,A,A"), at("LOCK", "DialLetters", "InvalidLetters")]
];
for (const [name, mutate, expected] of checks) test("데이터 검증: " + name, async () => {
  const sources = { ...await originals }; mutate(sources);
  const report = validator.validate(await memory(sources));
  assert.ok(report.issues.some(expected), report.issues.join("\n"));
});

test("data 폴더의 23개 CSV는 검증과 클래스 변환을 통과한다", async () => {
  const data = await readCsvDirectory(folder);
  const report = validator.validate(data);
  assert.equal(report.fileCount, defaultSchemas.length);
  assert.deepEqual(report.issues.filter(issue => issue.severity === "Error"), []);
  const store = new CsvDataStore(); store.register(data, validator);
  const game = new CsvGameData(store);
  assert.equal(game.puzzles.find(row => row.id === 5001).slotCount, 4);
  assert.equal(game.puzzleSlots.length, 44);
  assert.equal(game.characterStats[0].eyeHeight, 1.6);
});

test("23개 클래스의 모든 필드가 원본 CSV 값을 보존한다", async () => {
  const game = await loadGameData(folder);
  const bySheet = new Map(Object.values(game).filter(value => Array.isArray(value) && value.length).map(rows => [rows[0].constructor.table.sheetName, rows]));
  assert.equal(bySheet.size, 23);
  let cells = 0;
  for (const schema of defaultSchemas) {
    const document = game.source.getDocument(schema.name), rows = bySheet.get(schema.name);
    assert.equal(rows.length, document.rows.length);
    for (let i = 0; i < rows.length; i++) for (const column of schema.columns) {
      const property = column.name === "FOV" ? "fov" : column.name.replaceAll("ID", "Id").replace(/^./, text => text.toLowerCase());
      const raw = document.rows[i].get(column.name), value = rows[i][property];
      if (Array.isArray(value)) assert.deepEqual(value, raw === "" || (schema.name === "REGISTRY" && raw === "-") ? [] : schema.name === "PREFAB" && column.name === "Components" ? raw.split("|").map(value => Number(value.trim())) : raw.split(",").map(value => value.trim()));
      else if (column.optional && column.kind !== "text" && raw === "") assert.equal(value, null);
      else if (column.values?.join(",") === "Y,N") assert.equal(value, raw === "Y");
      else if (column.kind !== "text") assert.equal(value, Number(raw));
      else assert.equal(value, raw);
      cells++;
    }
  }
  assert.ok(cells > 0, "every source cell was compared; row counts are content data");
  assert.equal(game.components.find(row => row.id === 14002).params, "CamOffset=0,0.3,-0.5");
});

test("검증·초기화·변환·재조회에서 실제 파일은 한 번만 읽는다", async () => {
  const source = new Utf8CsvFileSource(), reads = new Map();
  const counting = { readText: async (file, signal) => { reads.set(file, (reads.get(file) ?? 0) + 1); return source.readText(file, signal); } };
  const store = new CsvDataStore();
  const load = signal => readCsvDirectory(folder, signal, counting);
  await store.initialize(load, validator); await store.initialize(load, validator);
  validator.validate(store.data); validator.validate(store.data);
  const first = new CsvGameData(store), second = new CsvGameData(store);
  assert.equal(reads.size, 23); assert.ok([...reads.values()].every(value => value === 1));
  assert.equal(first.source, store.data); assert.equal(first.puzzles, second.puzzles);
  assert.equal(store.getTable(PuzzleData.table), first.puzzles);
});

test("데이터 클래스 테이블은 함수와 객체에 그대로 주입할 수 있다", async () => {
  const game = await loadGameData(folder);
  const findAnswer = (slots, puzzleId, position) => slots.find(slot => slot.puzzleId === puzzleId && slot.slot === position).answer;
  assert.equal(findAnswer(game.puzzleSlots, 5001, 1), "3");
  assert.equal(findAnswer(game.puzzleSlots, 5003, 1), "Right");
  assert.ok(game.puzzles.filter(row => row.id >= 5007).every(row => row.clueRoom === null));
});

test("데이터 클래스·목록·리포트는 실행 중에도 읽기 전용이다", async () => {
  const data = await readCsvDirectory(folder), report = validator.validate(data), store = new CsvDataStore();
  store.register(data, validator); const game = new CsvGameData(store);
  assert.throws(() => { game.puzzles[0].id = 9; }, TypeError);
  assert.throws(() => game.puzzles.pop(), TypeError);
  assert.throws(() => game.consoles[0].buttons.push("Other"), TypeError);
  assert.throws(() => { game.source = undefined; }, TypeError);
  assert.throws(() => report.issues.push("bad"), TypeError);
  assert.equal(game.puzzles[0].id, 5001);
});

test("실패한 재등록은 정상 원본·변환 캐시·주입된 값을 유지한다", async () => {
  const store = new CsvDataStore(); const data = await readCsvDirectory(folder);
  let events = 0; const off = store.onRegistered(snapshot => { events++; assert.equal(store.data, snapshot); assert.equal(store.validation.data, snapshot); });
  store.register(data, validator); const game = new CsvGameData(store);
  const bad = { ...await originals }; cell(bad, "PUZZLE", 0, "SlotCount", "99");
  assert.equal(store.register(await memory(bad), validator).isValid, false);
  assert.equal(store.data, data); assert.equal(store.getTable(PuzzleData.table), game.puzzles); assert.equal(events, 1);
  store.register(data, validator); assert.equal(events, 1);
  const next = await memory(await originals); store.register(next, validator);
  assert.throws(() => store.getTable(PuzzleData.table));
  const replacement = new CsvGameData(store);
  assert.notEqual(replacement.puzzles, game.puzzles); assert.equal(game.puzzles[0].id, 5001);
  off(); store.register(data, validator); assert.equal(events, 2);
});

test("검증 전 변환과 중복 매핑을 거부하고 실패한 변환은 캐시에 남지 않는다", async () => {
  const store = new CsvDataStore(); assert.throws(() => new CsvGameData(store));
  assert.throws(() => store.mapTable(PuzzleData.table));
  store.register(await readCsvDirectory(folder), validator);
  store.mapTable(PuzzleData.table); assert.throws(() => store.mapTable(PuzzleData.table));
  let fail = true;
  const mapping = new CsvTableMapping("CARD", row => { if (fail) throw new Error("conversion"); return row.get("ID"); });
  assert.throws(() => store.mapTable(mapping)); assert.equal(store.tryGetTable(mapping), undefined);
  fail = false; assert.equal(store.mapTable(mapping).length, 50);
});

test("동시 초기화는 로딩을 공유하고 대기자 취소는 최초 로딩을 취소하지 않는다", async () => {
  const store = new CsvDataStore(); let release, reads = 0;
  const data = await readCsvDirectory(folder);
  const load = () => { reads++; return new Promise(resolve => { release = resolve; }); };
  const first = store.initialize(load, validator), second = store.initialize(load, validator);
  const cancellation = new AbortController();
  const waiting = store.initialize(load, validator, cancellation.signal); cancellation.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  release(data); await Promise.all([first, second]);
  assert.equal(reads, 1); assert.equal(store.data, data);
});

test("취소한 초기화의 늦은 결과는 등록하지 않고 재시도할 수 있다", async () => {
  const data = await readCsvDirectory(folder), store = new CsvDataStore(), cancellation = new AbortController();
  let release;
  const task = store.initialize(() => new Promise(resolve => { release = resolve; }), validator, cancellation.signal);
  cancellation.abort(); release(data);
  await assert.rejects(task, { name: "AbortError" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.hasData, false);
  assert.equal((await store.initialize(async () => data, validator)).isValid, true);
});

test("직접 등록한 최신 원본을 늦은 초기화가 덮어쓰지 않는다", async () => {
  const data = await readCsvDirectory(folder), replacement = await memory(await originals), store = new CsvDataStore();
  let release; const task = store.initialize(() => new Promise(resolve => { release = resolve; }), validator);
  store.register(replacement, validator); release(data); await task;
  assert.equal(store.data, replacement);
});

test("잘못된 CSV 등록 실패 후 초기화 재시도가 가능하다", async () => {
  const bad = { ...await originals }; delete bad.PUZZLE;
  const store = new CsvDataStore();
  assert.equal((await store.initialize(() => memory(bad), validator)).isValid, false);
  assert.equal((await store.initialize(() => readCsvDirectory(folder), validator)).isValid, true);
});

test("설정의 시트 이름 변경은 검증 규칙 코드를 수정하지 않는다", async () => {
  const renamed = Object.fromEntries(Object.entries(await originals).map(([name, text]) => [name.replaceAll("PUZZLE", "RIDDLES"), text.replaceAll("PUZZLE", "RIDDLES")]));
  const schemas = defaultSchemas.map(schema => ({ ...schema, name: schema.name.replaceAll("PUZZLE", "RIDDLES") }));
  assert.equal(new CsvValidator(schemas).validate(await memory(renamed)).isValid, true);
});

test("추가 규칙 주입·미등록 시트 일반 검사·선택 테이블 누락을 지원한다", async () => {
  const injected = new CsvValidator(defaultSchemas, [{ validate: context => context.warn("UnknownSchema", "TEST", 1, "", "injected") }]);
  assert.ok(injected.validate(await memory(await originals)).issues.some(issue => issue.details.includes("injected")));
  const unknown = { ...await originals, EXTRA: "ID,Value\n1,A\n1,B" };
  assert.ok(validator.validate(await memory(unknown)).issues.some(at("EXTRA", "ID", "DuplicateKey")));
  const optional = { ...await originals }; delete optional.SOUND; delete optional.SOUND_LINK;
  const store = new CsvDataStore(); assert.equal(store.register(await memory(optional), validator).isValid, true);
  const game = new CsvGameData(store); assert.deepEqual(game.sounds, []); assert.deepEqual(game.soundLinks, []);
});

test("GAME_CONFIG는 선언된 자료형으로만 숫자를 제공한다", async () => {
  const game = await loadGameData(folder);
  assert.equal(game.gameConfigs.find(row => row.id === 16001).asInt(), 900000);
  assert.equal(game.gameConfigs.find(row => row.id === 16030).asFloat(), 0.75);
  assert.throws(() => game.gameConfigs.find(row => row.id === 16002).asInt());
  const signed = GameConfigData.table.convert(parser.read("ID,Value,Type,Unit\n1,-3,int,").rows[0]); assert.equal(signed.asInt(), -3);
});

test("손상 UTF-8·CSV·누락 파일은 원본 위치를 보존하고 등록을 막는다", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "escape-csv-data-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "BAD.csv"), Buffer.from([0xff, 0xfe, 0xff]));
  await fs.writeFile(path.join(root, "BROKEN.csv"), 'ID\n"unclosed');
  const data = await readCsvDirectory(root), report = validator.validate(data);
  assert.ok(report.issues.some(issue => issue.sheet === "BAD" && issue.code === "ReadFailed"));
  assert.ok(report.issues.some(issue => issue.sheet === "BROKEN" && issue.code === "ParseError" && issue.line === 2));
  const missing = await CsvDataSet.load([["MISSING", path.join(root, "missing.csv")]], new CsvLoader(new Utf8CsvFileSource(), parser));
  assert.equal(missing.loadIssues[0].code, "ReadFailed");
  await assert.rejects(loadGameData(root), /CSV validation failed/);
});

test("자료형 변환 오류는 시트·행·컬럼을 포함한다", () => {
  const row = parser.read("ID,Type,SolverRoom,ClueRoom,InputAnchor,SlotCount,Active\n1,Test,1,,1,1,yes").rows[0];
  assert.throws(() => PuzzleData.table.convert(row), /PUZZLE.csv:2 \[Active\]/);
});

test("명령행 검증기는 기본 data 폴더를 검사하고 잘못된 폴더는 실패한다", () => {
  const script = path.resolve(__dirname, "../dist/tools/validateCsv.js");
  const good = spawnSync(process.execPath, [script], { cwd: os.tmpdir(), encoding: "utf8", timeout: 10000 });
  assert.equal(good.status, 0, good.stderr); assert.match(good.stdout, /23개 파일 \/ 오류 0개/);
  const missing = spawnSync(process.execPath, [script, path.join(os.tmpdir(), "missing-" + process.pid)], { encoding: "utf8", timeout: 10000 });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /CSV 오류/);
});
