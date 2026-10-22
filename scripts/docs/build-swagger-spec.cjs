const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

const groups = {
  operations: '1. 서버 상태·계약', participants: '2. 참가·퇴장', readiness: '3. 준비·생존 확인',
  content: '4. 게임 데이터', rooms: '5. 방 정답·문', legacy: '6. 기존 퍼즐 제출'
};
const descriptions = {
  JoinSession: ['participants', '세션 입장과 A/B 역할 배정', '빈 역할에 참가자를 등록하고 session_id, player, participant_token을 반환합니다. 정원은 2명이며 클라이언트가 역할을 지정하지 않습니다. 참가 토큰은 이후 x-participant-token 헤더에 전달합니다.', ['409']],
  QuerySession: ['readiness', '참가자·준비 단계·해금된 방 조회', 'Waiting=참가자 부족, Loading=두 명 중 씬 준비 미완료, Playing=두 명 모두 준비 완료입니다. 조회는 heartbeat 생존 시간을 갱신하지 않습니다. unlocked_room_ids는 방 번호가 아닌 ROOM.ID 목록입니다.', []],
  ReportSceneLoaded: ['readiness', '로컬 씬 준비 완료 보고', '실제 방·플레이어·입력 준비가 끝난 후 호출합니다. 대기실의 준비 버튼이 아닙니다. 두 참가자의 보고가 모두 끝나면 Playing입니다. 같은 참가자의 반복 보고는 ready=true를 유지합니다.', []],
  Heartbeat: ['readiness', '참가자 생존 확인', '기본 3000ms 간격으로 전송하고 서버는 마지막 heartbeat 이후 10000ms 미수신이면 참가자를 만료시킵니다. 만료된 토큰은 늦은 heartbeat로 복구되지 않습니다. 이 응답은 completed이며 snapshot을 포함하지 않습니다.', []],
  LeaveSession: ['participants', '세션 퇴장과 자리 반환', '참가 토큰과 역할 자리를 함께 제거합니다. 남은 참가자의 ready와 게임 진행은 유지되며, 모두 나간 뒤 다음 입장에서 진행이 초기화됩니다. 서버 재시작은 메모리 세션을 초기화합니다.', []],
  DownloadData: ['content', '검증된 CSV 데이터 번들 다운로드', '서버 시작 시 검증·등록한 메모리 CSV를 name/csv 목록과 SHA-256 version으로 전달합니다. Unity AssetBundle이나 프리팹 다운로드가 아닙니다. 현재 전체 테이블에는 PUZZLE_SLOT.Answer도 포함됩니다. 클라이언트는 다시 검증한 뒤 사용합니다.', []],
  SubmitPuzzle: ['legacy', '퍼즐 ID 기준 정답 제출 — 기존 검증용', '기존 디버그·검증 호출 호환 경로입니다. accepted=false는 제출 자격·해금·Playing 조건을 만족하지 못한 결과이며 HTTP 200으로 반환될 수 있습니다. 콘텐츠 입력에는 방 번호 기준 /rooms/answer 사용을 권장합니다.', ['413', '415']],
  SubmitRoomAnswer: ['rooms', '방 번호 기준 정답 제출', 'room_no와 순서가 있는 answers를 보냅니다. 서버가 토큰으로 역할을 확인하고 ROOM → PUZZLE → PUZZLE_SLOT을 조회합니다. value=true는 정답, false는 정상 오답입니다. BothSolved에서는 정답이어도 door_allowed=false일 수 있습니다. 통신·인증·역할 오류는 정상 false와 다른 failure 분기입니다.', ['409', '413', '415']],
  CheckRoomDoor: ['rooms', '방 번호 기준 문 사용 허가 확인', 'room_no를 보내고 answers는 비웁니다. value와 door_allowed는 모두 문 허가 여부입니다. 허가 시 해당 역할의 문과 Next 방을 해금합니다. 이후 해당 입장의 문 열기·닫기는 클라이언트 허가 캐시로 처리하므로 요청이 발생하지 않을 수 있습니다. 문 각도·애니메이션·실제 프리팹 생성은 서버가 동기화하지 않습니다.', ['409', '413', '415']]
};
const errorDescriptions = {
  400: 'PARTICIPANT_TOKEN_REQUIRED(4): 토큰 누락. 본문 API는 INVALID_REQUEST(5): 잘못된 Protobuf·방 번호·답 목록도 포함합니다.',
  403: 'INVALID_PARTICIPANT(3): 무효 또는 만료된 참가 토큰입니다.',
  404: 'SESSION_NOT_FOUND(2): 세션을 찾을 수 없습니다. 방 API는 ROOM_NOT_FOUND(8)도 포함합니다. 미등록 경로는 ROUTE_NOT_FOUND(12)입니다.',
  409: 'SESSION_FULL(1): 정원 초과. 방 API에서는 SUBMISSION_NOT_ALLOWED(9): 제출 역할·해금 위반, GAME_NOT_PLAYING(10): 양쪽 준비 미완료입니다.',
  413: 'PAYLOAD_TOO_LARGE(7): 요청 본문이 8192바이트를 초과했습니다.',
  415: 'UNSUPPORTED_MEDIA_TYPE(6): 요청 Content-Type이 application/protobuf가 아닙니다.',
  500: 'INTERNAL_ERROR(11): 서버 내부 처리에 실패했습니다.'
};
const fields = {
  room_no: '화면의 방 번호입니다. ROOM.ID와 구분합니다. C# RoomNo / TypeScript roomNo.',
  answers: '슬롯 순서대로 보낸 문자열 목록입니다. 최대 64개, 각 문자열 최대 256자. 숫자처럼 보여도 문자열과 앞자리 0을 유지합니다. 문 요청에서는 빈 목록이어야 합니다.',
  session_id: '서버 프로세스의 세션 식별자입니다.', participant_token: '참가 인증 토큰입니다. 이후 x-participant-token 헤더에 전달하며 로그에 기록하지 않습니다.',
  player_id: '서버가 발급한 참가자 식별자입니다.', role: '서버가 배정한 A/B 역할 enum입니다.', scene_loaded: '해당 참가자의 로컬 씬 준비 완료 여부입니다.',
  phase: '서버가 참가자 수와 준비 상태에서 계산한 게임 단계입니다.', players: '현재 참가자 목록입니다. 토큰은 포함하지 않습니다.',
  unlocked_room_ids: '누적 해금한 ROOM.ID 목록입니다. 같은 RoomNo라도 A/B의 ID는 다릅니다.',
  value: '정답 API에서는 정답 여부, 문 API에서는 문 허가 여부입니다. 정상 false는 failure가 아닙니다.',
  door_allowed: '문 사용 허가 여부입니다. BothSolved에서는 value=true인 정답 응답과 다를 수 있습니다.',
  accepted: '기존 퍼즐 ID 제출 경로의 제출 자격 승인 여부입니다.', correct: '기존 퍼즐 ID 제출 경로의 정답 여부입니다.',
  version: '정렬·재직렬화한 CSV 묶음의 SHA-256 내용 식별값입니다.', tables: '검증된 CSV 문자열 목록입니다.',
  name: 'CSV 시트 이름입니다.', csv: '헤더를 포함한 UTF-8 CSV 텍스트입니다.', code: '정수 SessionErrorCode입니다. HTTP 상태와 함께 확인합니다.',
  snapshot: '이번 판정 반영 후 게임 상태입니다.', player: '이번 입장에서 배정한 참가자 정보입니다.',
  joined: '입장 성공 결과입니다.', completed: '본문 필드가 없는 완료 결과입니다.', data: 'CSV 데이터 번들입니다.',
  puzzle: '기존 퍼즐 ID 제출 결과입니다.', room: '방 번호 기준 판정 결과입니다.', failure: '정상 게임 판정과 구분되는 요청 실패입니다.'
};

// 이 프로젝트의 proto3 메시지 구조를 문서 모델로 변환합니다. 지원하지 않는 문법은 누락시키지 않고 중단합니다.
function protobufSchemas() {
  const schemas = {};
  const blocks = (text, kind) => [...text.matchAll(new RegExp(`^${kind} (\\w+)\\s*\\{`, 'gm'))].map(match => {
    const start = match.index + match[0].length;
    let depth = 1, end = start;
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth++;
      else if (text[end] === '}') depth--;
      end++;
    }
    if (depth !== 0) throw new Error('닫히지 않은 Protobuf 선언: ' + match[1]);
    return [match[0], match[1], text.slice(start, end - 1)];
  });
  for (const name of ['common', 'session', 'game_api']) {
    const text = fs.readFileSync(path.join(root, `protocol/escape/v1/${name}.proto`), 'utf8').replace(/\/\/[^\n]*/g, '');
    for (const match of blocks(text, 'enum')) {
      const values = [...match[2].matchAll(/\b(\w+)\s*=\s*(\d+)\s*;/g)];
      schemas[match[1]] = { type: 'integer', format: 'int32', enum: values.map(row => Number(row[2])),
        description: values.map(row => `${row[2]} = ${row[1]}`).join('\n\n'), 'x-enum-varnames': values.map(row => row[1]) };
    }
    for (const match of blocks(text, 'message')) {
      const properties = {};
      for (const line of match[2].replace(/([;{}])/g, '$1\n').split('\n').map(line => line.trim()).filter(Boolean)) {
        if (/^oneof \w+\s*\{$/.test(line) || line === '}') continue;
        const field = /^(repeated\s+)?([\w.]+)\s+(\w+)\s*=\s*(\d+)\s*;$/.exec(line);
        if (!field) throw new Error(`문서 변환에서 지원하지 않는 Protobuf 선언: ${match[1]} / ${line}`);
        const [, repeated, type, fieldName, fieldNumber] = field;
        const value = type === 'string' ? { type: 'string' } : type === 'bool' ? { type: 'boolean' }
          : type === 'int32' ? { type: 'integer', format: 'int32' } : { $ref: `#/components/schemas/${type.split('.').at(-1)}` };
        const schema = repeated ? { type: 'array', items: value } : value;
        const description = fields[fieldName] ?? fieldName;
        // OpenAPI 3.0에서는 $ref의 형제 필드를 해석하지 않을 수 있어 allOf로 감쌉니다.
        properties[fieldName] = { ...(schema.$ref ? { allOf: [schema] } : schema), description, 'x-protobuf-field': Number(fieldNumber) };
        if (fieldName === 'answers') { properties[fieldName].maxItems = 64; properties[fieldName].items.maxLength = 256; }
        if (fieldName === 'room_no') { properties[fieldName].minimum = 1; properties[fieldName].maximum = 2147483647; }
      }
      const oneof = /oneof (\w+)/.exec(match[2]);
      schemas[match[1]] = oneof ? { description: '표시용 논리 구조입니다. 실제 전송은 Protobuf 바이너리이며 oneof 결과 중 하나만 존재합니다.',
        'x-protobuf-oneof': oneof[1], oneOf: Object.entries(properties).map(([name, schema]) => ({ type: 'object', required: [name], properties: { [name]: schema }, additionalProperties: false })) }
        : { type: 'object', description: 'Protobuf 메시지의 논리 구조입니다. JSON 전송 본문을 의미하지 않습니다.', properties };
    }
  }
  return schemas;
}

function binaryResponse(description) {
  return { description, headers: { 'X-Request-Id': { description: '서버 접근 로그와 대응하는 요청 UUID입니다.', schema: { type: 'string' } } },
    content: { 'application/protobuf': { schema: { type: 'string', format: 'binary' }, 'x-protobuf-message': 'escape.v1.GameApiResponse' } } };
}
function buildDocument(input) {
  const spec = structuredClone(input);
  spec.info = { title: '2인 협동 방탈출 서버 API', version: '1.0.0', description: [
    '## 통신과 문서 읽기',
    '게임 API 9개는 HTTP + Google Protobuf 바이너리(application/protobuf)입니다. /health와 /openapi.json만 JSON입니다. 아래 Schemas는 Protobuf 메시지의 설명용 논리 구조이며 게임 API가 JSON을 받는다는 뜻이 아닙니다.',
    '## 실행 흐름',
    '입장 → CSV 다운로드·검증·상대 입장 대기 → 각자 씬 로드 → 양쪽 ready → Playing → 정답 제출·문 허가 → 누적 방 해금 → 퇴장입니다. 기본 heartbeat는 3000ms, 서버 만료는 10000ms입니다.',
    '## 인증·결과',
    '입장 외 게임 요청은 x-participant-token 헤더가 필요합니다. 정답·문 value=false도 정상 200이며, 인증·입력·준비 오류는 GameApiResponse.failure와 HTTP 상태로 구분합니다. 게임 서버는 문 애니메이션·위치·음성을 중계하지 않습니다.',
    '## 이 화면의 범위',
    '이번 Swagger 화면은 문서 조회용입니다. 실행 버튼은 비활성화했습니다. Protobuf 실통신은 Unity 클라이언트와 npm run api:verify로 검사합니다. 서버는 단일 메모리 세션이며 재시작·재배포로 초기화됩니다.'
  ].join('\n\n') };
  spec.servers = [{ url: '/', description: '이 Swagger 문서를 제공하는 현재 서버' }];
  spec.tags = Object.values(groups).map(name => ({ name }));
  spec.components.schemas = protobufSchemas();
  spec.components.securitySchemes.ParticipantToken.description = '입장 응답의 participant_token을 전달합니다. Bearer 접두사는 사용하지 않습니다.';
  for (const [route, methods] of Object.entries(spec.paths)) for (const operation of Object.values(methods)) {
    if (operation['x-codegen-exclude']) continue;
    const details = descriptions[operation.operationId];
    if (!details) throw new Error(`API의 한글 설명을 추가하세요: ${operation.operationId}`);
    operation.tags = [groups[details[0]]]; operation.summary = details[1]; operation.description = details[2];
    for (const parameter of operation.parameters ?? []) parameter.description = parameter.name === 'sessionId'
      ? '입장 응답에서 받은 session_id입니다.' : '기존 검증 경로의 PUZZLE.ID입니다. 방 번호와 다릅니다.';
    const statuses = operation.operationId === 'JoinSession' ? ['409', '500'] : ['400', '403', '404', ...details[3], '500'];
    const success = String(operation['x-success-status']);
    operation.responses = { [success]: binaryResponse(`성공 결과: GameApiResponse.${operation['x-protobuf-outcome']}. ${operation.operationId === 'SubmitRoomAnswer' ? 'value는 정답 여부이며 door_allowed와 구분합니다.' : operation.operationId === 'CheckRoomDoor' ? 'value와 door_allowed는 문 사용 허가 여부입니다.' : ''}`),
      ...Object.fromEntries(statuses.map(code => [code, binaryResponse(errorDescriptions[code])])),
      default: binaryResponse('실패 결과: GameApiResponse.failure. Schemas의 SessionErrorCode 정수 값을 확인하세요.') };
    if (operation.requestBody) operation.requestBody.description = `Protobuf ${operation['x-protobuf-request']} 바이너리입니다. 최대 8192바이트. Schemas에서 필드 번호·자료형을 확인하세요. JSON 텍스트는 지원하지 않습니다.`;
    if (operation.operationId === 'CheckRoomDoor') operation.description += '\n\n1번 방 요청의 바이너리 예: 08 01 (room_no=1, answers 비움). DoorHinge나 프리팹 생성 성공 여부를 검사하는 API는 아닙니다.';
  }
  spec.paths['/health'] = { get: { operationId: 'Health', 'x-codegen-exclude': true, tags: [groups.operations], summary: '서버 HTTP 수신 상태 확인',
    description: 'status=ok는 서버 응답 가능 여부입니다. 두 참가자의 Playing·음성 송수신·클라 프리팹 생성을 보장하지 않습니다.', security: [],
    responses: { 200: { description: '서버 응답 정상', content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } }, example: { status: 'ok' } } } } } } };
  spec.paths['/openapi.json'] = { get: { operationId: 'GetOpenApi', 'x-codegen-exclude': true, tags: [groups.operations], summary: '이 서버의 OpenAPI 계약 조회',
    description: 'Swagger UI가 표시하는 OpenAPI 3.0.3 문서입니다. 운영 경로는 게임용 C# 호출 코드 생성에서 제외합니다.', security: [],
    responses: { 200: { description: '현재 생성된 OpenAPI 문서', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } } } };
  return spec;
}

if (require.main === module) {
  const file = path.join(root, 'protocol/http/openapi.json');
  const output = JSON.stringify(buildDocument(JSON.parse(fs.readFileSync(file, 'utf8'))), null, 2) + '\n';
  if (fs.readFileSync(file, 'utf8') !== output) fs.writeFileSync(file, output);
  console.log('한글 OpenAPI 문서와 Protobuf 설명 모델을 갱신했습니다. 서버 반영: npm run proto:sync -- --target server --apply');
}
module.exports = { buildDocument, protobufSchemas };
