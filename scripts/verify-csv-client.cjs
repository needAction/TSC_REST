const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { CsvParser } = require("../dist/common/csv/CsvParser");
const { CsvParseError } = require("../dist/common/csv/CsvParseError");

const root = path.resolve(__dirname, "..");
function run(file, args, extra = {}) {
  const result = spawnSync(file, args, { cwd: root, encoding: "utf8", windowsHide: true, ...extra });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stdout || "") + (result.stderr || "") + `\n검사 명령 실패: ${file}`);
  return (result.stdout || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}
function encode(value) { return Buffer.from(value, "utf8").toString("base64"); }
function canonical(text) {
  try {
    const doc = new CsvParser().read(text, "fixture.csv");
    const lines = ["OK", String(doc.headers.length), ...doc.headers.map(encode), String(doc.rows.length)];
    for (const row of doc.rows) lines.push(String(row.sourceLine), ...doc.headers.map(header => encode(row.get(header))));
    return lines.join("\n") + "\n";
  } catch (error) {
    if (!(error instanceof CsvParseError)) throw error;
    return ["ERROR",error.code,error.lineNumber,error.fieldNumber].join("\n") + "\n";
  }
}
function main() {
  const args = process.argv.slice(2); const options = {};
  while (args.length) {
    const key = args.shift();
    if (!["--source-root", "--unity-editor"].includes(key) || !args.length || options[key])
      throw new Error("사용법: --source-root <Assets/3.Script 경로> --unity-editor <Unity Editor 폴더>");
    options[key] = path.resolve(args.shift());
  }
  if (!options["--source-root"] || !options["--unity-editor"]) throw new Error("--source-root와 --unity-editor를 지정하세요.");
  const sources = options["--source-root"];
  const data = path.join(options["--unity-editor"], "Data");
  const suffix = process.platform === "win32" ? ".exe" : "";
  const runtime = path.join(data, "NetCoreRuntime", "dotnet" + suffix);
  const compiler = path.join(data, "DotNetSdkRoslyn", "csc.dll");
  const mono = path.join(data, "MonoBleedingEdge", "bin", "mono" + suffix);
  const references = path.join(data, "MonoBleedingEdge", "lib", "mono", "4.7.2-api");
  for (const file of [runtime, compiler, mono]) if (!fs.existsSync(file)) throw new Error(`Unity 검증 도구가 없습니다: ${file}`);
  const coreDir = path.join(sources, "Common", "Csv");
  const core = fs.readdirSync(coreDir).filter(name => name.endsWith(".cs")).map(name => path.join(coreDir, name));
  for (const file of core) if (/UnityEngine|Unity\.Services/.test(fs.readFileSync(file,"utf8"))) throw new Error(`CSV 코어의 Unity 의존성: ${file}`);
  const fileSource = path.join(sources, "Data", "Infrastructure", "Utf8CsvFileSource.cs");
  const output = path.join(root, ".csv-verification"); fs.mkdirSync(output, { recursive: true });
  const shared = ["/nologo", "/noconfig", "/nostdlib", "/langversion:9",
    ...["mscorlib.dll","System.dll","System.Core.dll","Facades/netstandard.dll"].map(file => "/reference:" + path.join(references, file))];
  const executable = path.join(output,"CsvReaderChecks.exe");
  run(runtime, [compiler,...shared,"/target:exe","/out:"+executable,...core,fileSource,path.join(root,"tests/csv/CsvReaderChecks.cs")]);
  console.log(run(mono,[executable,"checks"]).trim());
  const fixtures = require("../tests/fixtures/csv-reader-cases.json");
  for (const fixture of fixtures) {
    const received = run(mono,[executable],{input:encode(fixture.csv)});
    if (received !== canonical(fixture.csv)) throw new Error(`C#/TS CSV 해석 차이: ${fixture.name}\n${received}`);
  }
  const unityReferences = fs.readdirSync(path.join(data,"Managed","UnityEngine"))
    .filter(name => /^UnityEngine.*\.dll$/.test(name)).map(name => "/reference:" + path.join(data,"Managed","UnityEngine",name));
  const compiled = run(runtime,[compiler,...shared,...unityReferences,"/target:library","/out:"+path.join(output,"CsvUnityCompile.dll"),
    ...core,fileSource,path.join(sources,"Data/Infrastructure/UnityTextAssetCsvSource.cs"),path.join(sources,"Tests/CsvLoadTester.cs")]);
  if (compiled.trim()) console.log(compiled.trim());
  console.log(`공통 CSV ${fixtures.length}개 C#/TypeScript 교차 검사와 Unity 참조 컴파일 통과`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
