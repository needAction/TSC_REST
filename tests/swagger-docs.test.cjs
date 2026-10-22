const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { verify } = require('../scripts/verify-api-docs.cjs');
const { buildDocument, protobufSchemas } = require('../scripts/docs/build-swagger-spec.cjs');
const { createSessionHttpServer } = require('../dist/infrastructure/http/createSessionHttpServer');
const { HttpAccessLogger } = require('../dist/infrastructure/http/HttpAccessLogger');
const { gameApiOpenApi, gameApiOperations } = require('../dist/generated/http/game-api');

test('Swagger 표준·원본·생성 문서·Protobuf 모델이 일치한다', async () => {
  await verify();
  assert.deepEqual(buildDocument(gameApiOpenApi), gameApiOpenApi);
  const schemas = protobufSchemas();
  assert.deepEqual(Object.keys(schemas.PuzzleCommandRequest.properties), ['answers']);
  assert.deepEqual(Object.keys(schemas.OperationCompleted.properties), []);
  assert.deepEqual(Object.keys(schemas.CsvText.properties), ['name', 'csv']);
  assert.equal(schemas.GameApiResponse.oneOf.length, 7);
  assert.deepEqual(schemas.SessionErrorCode.enum, [...Array(13).keys()]);
  assert.equal(schemas.RoomCommandRequest.properties.room_no['x-protobuf-field'], 1);
  assert.equal(schemas.RoomCommandRequest.properties.answers['x-protobuf-field'], 2);
});

test('게임 API는 Protobuf 9개를 유지하고 운영 API만 JSON으로 문서화한다', () => {
  assert.equal(gameApiOperations.length, 9);
  assert.equal(Object.keys(gameApiOpenApi.paths).length, 11);
  for (const op of gameApiOperations) {
    const operation = gameApiOpenApi.paths[op.path][op.method.toLowerCase()];
    assert.ok(operation.summary && /[가-힣]/.test(operation.summary));
    assert.ok(operation.tags.length > 0);
    assert.deepEqual(Object.keys(operation.responses[op.successStatus].content), ['application/protobuf']);
    if (operation.requestBody) assert.deepEqual(Object.keys(operation.requestBody.content), ['application/protobuf']);
    assert.deepEqual(operation.security ?? [], op.name === 'JoinSession' ? [] : [{ ParticipantToken: [] }]);
  }
  for (const path of ['/health', '/openapi.json']) {
    const operation = gameApiOpenApi.paths[path].get;
    assert.equal(operation['x-codegen-exclude'], true);
    assert.ok(operation.responses[200].content['application/json']);
    assert.equal(gameApiOperations.some(op => op.path === path), false);
  }
});

test('Swagger 화면·정적 자원·문서는 실제 HTTP에서 제공되고 임의 파일을 노출하지 않는다', async t => {
  const entries = [];
  const server = createSessionHttpServer({}, new HttpAccessLogger({ write: entry => entries.push(entry) }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const redirect = await fetch(base + '/swagger', { redirect: 'manual' });
  assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), '/swagger/'); await redirect.text();
  const html = await fetch(base + '/swagger/'); const text = await html.text();
  assert.equal(html.status, 200); assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(text, /lang="ko"/); assert.match(text, /\/swagger\/swagger-ui-bundle.js/);
  assert.equal(text.includes('https://'), false);
  const initializer = await (await fetch(base + '/swagger/swagger-initializer.js')).text();
  assert.match(initializer, /url: '\/openapi.json'/);
  assert.match(initializer, /supportedSubmitMethods: \[\]/);
  assert.match(initializer, /validatorUrl: null/);
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js']) {
    const response = await fetch(base + '/swagger/' + file);
    assert.equal(response.status, 200); assert.ok((await response.arrayBuffer()).byteLength > 1000);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  }
  const spec = await (await fetch(base + '/openapi.json')).json();
  assert.deepEqual(spec, gameApiOpenApi);
  for (const invalid of ['/swagger/package.json', '/swagger/swagger-ui-bundle.js.map', '/swagger/%2e%2e/package.json']) {
    const response = await fetch(base + invalid); await response.arrayBuffer(); assert.equal(response.status, 404);
  }
  const post = await fetch(base + '/swagger/', { method: 'POST' }); await post.arrayBuffer(); assert.equal(post.status, 404);
  assert.ok(entries.some(entry => entry.operation === 'SwaggerUi' && entry.statusCode === 200));
});
