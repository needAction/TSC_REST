const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { buildDocument } = require('./docs/build-swagger-spec.cjs');

async function verify() {
  const root = path.resolve(__dirname, '..');
  const document = JSON.parse(fs.readFileSync(path.join(root, 'protocol/http/openapi.json'), 'utf8'));
  await SwaggerParser.validate(structuredClone(document), { resolve: { external: false } });
  assert.deepEqual(document, buildDocument(document), '한글 문서/Protobuf 모델이 오래됐습니다. api:docs:update를 실행하세요.');
  const { gameApiOpenApi, gameApiOperations } = require('../dist/generated/http/game-api');
  assert.deepEqual(gameApiOpenApi, document, '서버 생성 문서가 오래됐습니다. proto:sync -- --target server --apply를 실행하세요.');
  assert.equal(gameApiOperations.length, 9);
  console.log(`Swagger/OpenAPI 검증 통과: API ${Object.keys(document.paths).length}개, Protobuf 설명 모델 ${Object.keys(document.components.schemas).length}개, 게임 호출 계약 ${gameApiOperations.length}개`);
}
if (require.main === module) verify().catch(error => {
  console.error('[Swagger 검증] ' + error.message);
  process.exitCode = 1;
});
module.exports = { verify };
