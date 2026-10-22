const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'protocol/data/content-contract.json'), 'utf8'));
const args = process.argv.slice(2);
const clientIndex = args.indexOf('--client-root');
const clientRoot = clientIndex < 0 ? undefined : path.resolve(args[clientIndex + 1]);
const check = args.includes('--check');
function output(file, value) {
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== value) throw new Error('계약 생성물 불일치: ' + file); }
  else { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, value); }
}
output(path.join(root, 'src/data/ContentContract.ts'), '// protocol/data/content-contract.json에서 생성. 직접 수정하지 않습니다.\nexport const contentContract = ' + JSON.stringify(contract, null, 2) + ' as const;\n');
if (clientRoot) {
 const array = values => 'new[] { ' + values.map(v => JSON.stringify(v)).join(', ') + ' }';
 output(path.join(clientRoot, 'Assets/3.Script/Data/ContentContract.cs'),
  '// protocol/data/content-contract.json에서 생성. 직접 수정하지 않습니다.\nnamespace EscapeGame.Data\n{\n    public static class ContentContract\n    {\n' +
  ['features','puzzleTypes','colors'].map(k => `        public static System.Collections.Generic.IReadOnlyList<string> ${k[0].toUpperCase()+k.slice(1)} { get; } = System.Array.AsReadOnly(${array(contract[k])});\n`).join('') +
  '        public static string RequiredParameter(string feature) => feature switch { ' + Object.entries(contract.parameters).map(([name, keys]) => JSON.stringify(name) + ' => ' + JSON.stringify(keys[0])).join(', ') + ', _ => null };\n' +
  '    }\n}\n');
}
console.log('콘텐츠 공통 계약 ' + (check ? '검사' : '생성') + ' 완료');
