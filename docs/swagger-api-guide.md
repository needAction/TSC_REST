# 서버 API Swagger 사용 안내

접속 안내 갱신일: 2026-10-23. 현재 서버의 HTTP 경로·Controller·Protobuf 계약을 기준으로 작성했습니다. 6절의 구현 검증 기록은 2026-10-22 기준입니다.

## 1. 문서를 여는 방법

### 1.1 현재 로컬 도커에서 바로 접속

현재 테스트 PC에서는 브라우저 주소창에 **[http://127.0.0.1:3001/swagger/](http://127.0.0.1:3001/swagger/)** 를 입력합니다. 유니티 실행은 필요하지 않으며 서버 컨테이너가 실행 중이어야 합니다.

현재 컨테이너 이름은 `escape-server-lan-test`이고, PC의 **3001번 포트가 컨테이너 내부의 3000번 포트**에 연결되어 있습니다. 따라서 브라우저에는 3001을 사용합니다. 별도 서버를 중복 실행할 필요는 없습니다.

접속되지 않으면 Windows PowerShell에서 순서대로 확인합니다.

```powershell
docker ps -a --filter name=escape-server-lan-test
```

컨테이너가 존재하지만 종료 상태라면 Docker Desktop을 실행한 상태에서 다음 명령으로 시작합니다. 이미 실행 중이면 생략합니다.

```powershell
docker start escape-server-lan-test
Invoke-RestMethod http://127.0.0.1:3001/health
```

`status`가 `ok`이면 위 스웨거 주소를 엽니다. 컨테이너 자체가 없으면 [도커 배포 가이드](docker-deployment.md)의 로컬 배포 절차로 생성합니다. 상태 확인도 실패하면 아래 명령으로 서버 시작 오류를 확인합니다.

```powershell
docker logs --tail 100 escape-server-lan-test
```

2026-10-23 현재 실행 중인 컨테이너에서 `/health`, `/swagger/`, `/openapi.json`, 화면 구성 파일 3개가 모두 HTTP 200으로 응답하는 것을 확인했습니다. 이 검사는 문서와 자원 제공 확인이며 브라우저 화면·게임 전체 동작 검사는 아닙니다.

### 1.2 다른 실행 환경

서버 프로젝트 폴더에서 실행합니다. 서버가 꺼져 있으면 문서도 열리지 않습니다.

```powershell
npm.cmd ci
npm.cmd run run:local
```

브라우저에서 **http://127.0.0.1:3000/swagger/** 를 엽니다. 계약 원본 응답은 **http://127.0.0.1:3000/openapi.json** 입니다. `.env.local`에서 PORT를 바꿨다면 그 포트를 사용합니다. 다른 서버가 같은 포트로 실행 중이면 중복 실행하지 않습니다.

| 실행 환경 | Swagger 주소 |
|---|---|
| 현재 로컬 도커를 실행한 PC | `http://127.0.0.1:3001/swagger/` |
| 같은 PC local 기본값 | `http://127.0.0.1:3000/swagger/` |
| 기존 LAN Docker 설정 | `http://192.168.1.34:3001/swagger/` |
| 현재 EC2 주소 | `http://32.236.55.218:3000/swagger/` |

Docker와 EC2는 **이번 코드를 포함한 새 이미지를 배포한 뒤** 문서가 제공됩니다. 기존 `run-docker-local.cmd` 또는 `deploy-cloud.cmd`를 사용합니다. 추가 포트는 필요하지 않으며, 기존 게임 서버 포트의 보안 그룹 허용 범위를 따릅니다. 이번 작업에서 클라우드 배포는 실행하지 않았습니다.

다른 PC에서 접속할 때 `127.0.0.1`은 그 PC 자신을 뜻하므로 서버 PC의 실제 주소를 사용합니다. 위 사설 IP와 EC2 주소는 저장된 설정 기준이며, 주소가 변경되면 새 주소로 바꿉니다. EC2 주소의 현재 접속 가능 여부는 이번 로컬 확인에 포함하지 않았습니다.

## 2. 기능별 API 목록

화면에서 그룹·경로를 검색하고 각 행을 펼치면 목적, 매개변수, 인증, 성공 결과, 실패 HTTP 상태를 확인할 수 있습니다. 설명은 한글이며 경로·필드명·operationId는 코드와 동일하게 유지합니다. Swagger UI 기본 조작 문구는 배포 패키지의 기본 언어를 사용합니다.

| 그룹 | 메서드·경로 | 의미 |
|---|---|---|
| 1. 서버 상태·계약 | `GET /health` | HTTP 수신 상태 확인 |
| | `GET /openapi.json` | 현재 서버의 OpenAPI 계약 |
| 2. 참가·퇴장 | `POST /sessions/join` | 입장, A/B 역할과 토큰 발급 |
| | `POST /sessions/{sessionId}/leave` | 퇴장과 자리 반환 |
| 3. 준비·생존 확인 | `GET /sessions/{sessionId}` | 참가자·준비 단계·해금 상태 조회 |
| | `POST /sessions/{sessionId}/ready` | 실제 로컬 씬 준비 완료 보고 |
| | `POST /sessions/{sessionId}/heartbeat` | 참가 생존 시간 갱신 |
| 4. 게임 데이터 | `GET /sessions/{sessionId}/data` | 검증된 CSV 문자열 번들 다운로드 |
| 5. 방 정답·문 | `POST /sessions/{sessionId}/rooms/answer` | 방 번호와 답 목록으로 정답 확인 |
| | `POST /sessions/{sessionId}/rooms/door` | 방 번호로 문 사용 허가 확인 |
| 6. 기존 퍼즐 제출 | `POST /sessions/{sessionId}/puzzles/{puzzleId}/submit` | 기존 퍼즐 ID 기반 검증 경로 |

게임 API 9개와 운영 API 2개를 합쳐 **11개**입니다. Swagger 화면과 CSS·JavaScript 제공 경로는 이 업무 API 수에 포함하지 않습니다.

## 3. 통신·인증·데이터를 읽는 기준

### 3.1 Protobuf 바이너리와 설명 모델

게임 API는 기존처럼 `application/protobuf` 바이너리를 사용합니다. `/health`와 `/openapi.json`만 JSON입니다. 화면 아래 Schemas의 메시지·enum **16개는 Protobuf를 설명하는 논리 구조**이며 JSON 게임 요청을 허용한다는 뜻이 아닙니다.

필드 설명에는 원본 proto 필드명, 자료형, 필드 번호(`x-protobuf-field`)를 넣었습니다. `GameApiResponse`는 성공·실패 결과 중 하나만 존재하는 `oneof`입니다. 바이너리 응답을 해석한 뒤 `joined`, `snapshot`, `completed`, `data`, `puzzle`, `room`, `failure` 중 실제 분기를 읽습니다.

**현재 Swagger 화면은 문서 조회용이며 Try it out은 비활성화했습니다.** Swagger UI가 JSON 객체를 Protobuf로 변환하지 않기 때문입니다. 실제 왕복 검사는 Unity 또는 `npm.cmd run api:verify`를 사용합니다. Authorize 창은 인증 헤더 정의를 보여주며, 토큰을 입력해도 이 화면에서 게임 요청은 실행되지 않습니다.

### 3.2 참가자와 게임 흐름

```text
입장 → 서버 CSV 다운로드·검증 + 상대 입장 대기
     → 각 클라이언트 씬 구성 → 각각 ready → 양쪽 준비 완료: Playing
     → 정답 제출 / 문 허가 → 자기 Next 방 누적 해금 → 퇴장

입장 유지 중: heartbeat 기본 3초 간격 → 10초 미수신 시 만료
```

입장 외 게임 요청은 `x-participant-token` 헤더가 필요합니다. 입장 응답의 `participant_token`을 그대로 전달하며 Bearer 접두사를 붙이지 않습니다. 역할은 토큰에서 결정하므로 클라이언트가 A/B를 요청 본문으로 지정하지 않습니다. 상태 조회만으로 생존 시간이 연장되지는 않습니다.

### 3.3 정답과 문의 판정

| 항목 | 정답 API | 문 API |
|---|---|---|
| 요청 메시지 | `RoomCommandRequest` | `RoomCommandRequest` |
| `room_no` | 화면 방 번호 | 화면 방 번호 |
| `answers` | 슬롯 순서의 문자열 목록 | 빈 목록 |
| `room.value` | 정답이면 true, 오답이면 false | 허가면 true, 잠금이면 false |
| `room.door_allowed` | 실제 문 사용 허가 | 실제 문 사용 허가 |

`room_no`는 `ROOM.ID`가 아닙니다. `unlocked_room_ids`는 반대로 `ROOM.ID` 목록입니다. 답은 문자열이므로 앞자리 0과 슬롯 순서를 보존합니다. 요청 본문 최대 8192바이트, 답 최대 64개·각 256자입니다.

정상 오답·잠금은 HTTP 200의 `room` 결과입니다. 인증·입력·준비 오류는 `failure`이며 false로 섞지 않습니다. 마지막 방처럼 `BothSolved` 조건을 쓰면 자기 정답 `value=true`라도 상대가 아직 풀지 않아 `door_allowed=false`일 수 있습니다. 허가를 받은 문은 클라이언트에서 캐시하므로 이후 열고 닫을 때 매번 통신하지 않습니다.

서버는 문 애니메이션·프리팹 생성·음성을 동기화하지 않습니다. 문 허가와 해금 응답만으로 다음 방의 모든 프리팹 생성까지 성공했다고 판단할 수는 없습니다. `/health`의 ok도 게임 전체 검증 결과는 아닙니다.

### 3.4 실패 상태

| HTTP | 주요 실패 |
|---|---|
| 400 | 토큰 누락, 잘못된 Protobuf·방 번호·답 목록 |
| 403 | 무효·만료된 참가 토큰 |
| 404 | 세션·방·경로 없음 |
| 409 | 정원 초과, 제출 역할·해금 조건 위반, Playing 미진입 |
| 413 | 요청 본문 크기 초과 |
| 415 | 지원하지 않는 Content-Type |
| 500 | 내부 처리 실패 |

각 API 행의 상태 설명과 `SessionErrorCode` 숫자를 함께 확인합니다. `X-Request-Id`는 접근 로그의 요청 ID와 대응합니다. 기존 퍼즐 ID 경로는 `accepted=false`를 HTTP 200으로 반환할 수 있어 방 번호 경로와 결과 해석이 다릅니다.

## 4. 코드의 역할과 연결

```text
protocol/escape/v1/*.proto ── 문서 모델 생성 ──┐
                                            ↓
protocol/http/openapi.json ← api:docs:update (한글 설명·그룹)
             ↓ 기존 HTTP/Protobuf 생성·검사 도구
src/generated/http/game-api.ts
             ├─ gameApiOperations: 기존 게임 호출 9개
             └─ gameApiOpenApi: 문서 API 포함 11개
                            ↓ GET /openapi.json
createSessionHttpServer → SwaggerUiHttpHandler → /swagger/
                            ↑
                    서버에 포함된 Swagger UI 자원
```

| 파일 | 책임과 의도 |
|---|---|
| `protocol/http/openapi.json` | HTTP 계약 원본. 경로·메서드·요청/결과와 한글 설명을 한곳에서 관리 |
| `scripts/docs/build-swagger-spec.cjs` | 현재 proto 메시지를 설명 모델로 변환하고 기능별 한글 설명을 병합. 미지원 메시지 문법은 오류로 중단 |
| `scripts/generate-http-api.cjs` | 기존 서버/클라 호출 생성기. `x-codegen-exclude=true`인 운영 JSON API는 게임 호출 생성에서 제외 |
| `src/generated/http/game-api.ts` | 생성된 게임 호출 정의와 서버 제공 OpenAPI 문서. 직접 편집 금지 |
| `src/infrastructure/http/SwaggerUiHttpHandler.ts` | 문서 자원 제공 전용 HTTP Adapter. 허용한 고정 자원만 제공하고 한 번 읽은 자원을 메모리에 보관 |
| `src/infrastructure/http/createSessionHttpServer.ts` | 문서 요청을 전용 Handler에, 게임 요청을 기존 Controller에 연결 |
| `scripts/verify-api-docs.cjs` | OpenAPI 표준·원본/생성 문서·proto 설명 모델 일치 검사 |
| `tests/swagger-docs.test.cjs` | 실 HTTP 문서 조회·자원 제공·경로 제한·기존 Protobuf 계약 검사 |

문서 표현을 도메인·SessionService에 넣지 않고 HTTP 인프라 어댑터에 한정했습니다. 별도의 도메인 상태나 이벤트 버스는 필요하지 않아 추가하지 않았습니다. UI는 `swagger-ui-dist` 운영 의존성으로 서버와 함께 배포되며 외부 CDN 없이 실행합니다. 외부 Swagger 검증 서비스도 사용하지 않습니다.

기존 Dockerfile이 운영 의존성을 최종 이미지에 복사하므로 별도 문서 서버나 Dockerfile 변경 없이 포함됩니다. Unity의 메시지·호출 메서드·게임 바이너리 형식은 변경하지 않았고, 이번 문서 추가만으로 Unity를 다시 빌드할 필요는 없습니다.

## 5. API 변경 후 문서를 갱신하는 순서

1. 실제 HTTP 경로·메시지 변경 시 `protocol/http/openapi.json`과 `.proto`를 변경합니다. 신규 기능의 한글 설명은 `build-swagger-spec.cjs`에도 추가합니다.
2. 설명 모델을 갱신하고 기존 생성 도구로 서버 문서를 반영합니다.

```powershell
npm.cmd run api:docs:update
npm.cmd run proto:sync -- --target server --apply
npm.cmd run api:docs:verify
```

3. **실제 클라 통신 계약도 변경했다면** 기존 `npm.cmd run api:sync -- --apply`로 서버/Unity 생성·교차 통신 검사·로컬 반영까지 진행합니다. 문서 전용 변경과 구분하며 Git 반영은 작업자가 직접 합니다.
4. 서버를 재시작하거나 Docker 새 이미지를 배포한 후 `/swagger/`와 `/openapi.json`을 확인합니다. JSON 원본만 바꿔도 실행 중 서버에 바로 반영되는 구조는 아닙니다.

생성 도구와 교차 검사에 필요한 .NET·protoc 준비 및 대상 경로는 [Protobuf 도구 안내](../protocol/TOOL.md)를 따릅니다. 모든 빌드에서 자동으로 생성 도구를 실행하지 않고, 검증된 생성 파일을 서버에 포함하는 기존 방식을 유지했습니다.

## 6. 이번 검증 결과와 남은 제한

- TypeScript 빌드와 OpenAPI 표준 검사 통과: API 11개, 설명 모델 16개, 게임 호출 9개.
- 서버용 생성·TS/C# 바이너리 교차 검사 통과.
- Swagger·방 API·접근 로그 집중 검사 16개 통과. 브라우저에서 한글 목록과 API 상세 표시 확인.
- 전체 서버 검사 **170개 모두 통과**했습니다. WIRE·ARROW는 추후 확장용이므로 헤더만 있는 상태를 정상으로 유지합니다. 실제 CSV와 런타임 검증기는 수정하지 않았습니다.
- 기존 CSV 테스트의 첫 행 가정은 메모리 검사용 행으로 대체했고, 23개 모델 비교는 빈 목록까지 시트 이름으로 직접 대응하도록 보완했습니다. 헤더만 있는 WIRE·ARROW가 정상 등록되고 빈 목록으로 주입되는 검사도 추가했습니다. 테스트 값 변경이 없는 경우를 놓치지 않도록 행 존재 여부도 확인합니다.
- Swagger의 Protobuf 인코딩/실행 기능은 이번 범위에 포함하지 않았습니다. 후속으로 필요하면 기존 `.proto` 기반 인코딩 어댑터와 응답 디코더를 별도로 연결해야 합니다.

설정 기준: [Swagger UI 공식 설정](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/), [OpenAPI 미디어 타입](https://swagger.io/docs/specification/v3_0/media-types/).
