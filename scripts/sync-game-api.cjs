const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(script + ' 실패');
}
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('사용법: npm run api:sync -- [--apply]');
  run('scripts/proto-tool.cjs', ['sync']);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'protocol.projects.local.json'), 'utf8'));
  const client = path.resolve(root, config.clientProject);
  const { stage } = JSON.parse(fs.readFileSync(path.join(root, '.protocol-tools/latest-verified.json'), 'utf8'));
  const overlay = fs.mkdtempSync(path.join(root, '.protocol-tools/http-overlay-'));
  for (const folder of ['Assets/3.Script', 'Assets/Plugins/Protobuf', 'Assets/11.CSV', 'Assets/StreamingAssets', 'Tools/CsvValidation.Tests']) {
    const source = path.join(client, folder);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(overlay, folder), { recursive: true, filter: file => !file.split(path.sep).some(part => ['bin', 'obj'].includes(part)) });
  }
  fs.cpSync(path.join(stage, 'csharp'), path.join(overlay, 'Assets/3.Script/Generated/Protocol'), { recursive: true });
  run('scripts/verify-game-api.cjs', ['--client', overlay]);
  if (args.includes('--apply')) run('scripts/proto-tool.cjs', ['deploy', '--apply']);
  else console.log('API 교차/HTTP 검증 완료. 로컬 생성 코드 반영: npm run api:sync -- --apply');
} catch (error) {
  console.error('[API 동기화] ' + error.message);
  process.exitCode = 1;
}
