# 서버 접근 로그: 위치·구조·의도·확인 방법

작성일: 2026-10-22. 대상은 현재 Node.js HTTP + Google Protobuf 서버입니다. 이번 구현은 **서버가 받은 HTTP 요청의 최종 처리 결과**를 요청당 JSON 한 줄로 기록합니다.

## 1. 기능 계층과 구현 위치

```text
main.ts                                    객체 조립·참가자 식별 함수 주입
└─ createSessionHttpServer                  모든 HTTP 요청에 로거 연결·경로 이름 지정
   ├─ HttpAccessLogger.observe              요청 ID·시작 시각·finish/close 관찰
   │  └─ HttpRequestLogContext              요청별 허용 진단 값만 보관
   ├─ SessionController                    해석된 roomNo/puzzleId/답 개수 기록
   ├─ 기존 SessionService·도메인 모델       기존 인증·게임 판정 수행
   └─ ProtobufHttp.write                    실제 응답 결과에서 허용 값만 Context에 전달
      └─ 응답 finish 또는 조기 close
         └─ HttpAccessLogger                최종 결과·소요 시간 확정, 한 번만 발행
            └─ ILogSink                     전송 기술과 독립적인 출력 계약
               └─ ConsoleJsonLogSink        stdout JSON 한 줄 → Docker 로그 수집
```

| 파일 | 핵심 메서드/정의 | 책임과 구현 의도 |
|---|---|---|
| `src/common/logging/ILogSink.ts` | `DiagnosticLogEntry`, `ILogSink<TEntry>.write` | 공통 구조화 로그 출력 포트. 후속 패킷 처리 이벤트도 같은 계약으로 확장 가능 |
| `src/infrastructure/logging/ConsoleJsonLogSink.ts` | `write` | JSON.stringify 후 console.log. 외부 로그 SDK·파일 저장을 게임 규칙에서 분리 |
| `src/infrastructure/http/HttpAccessLogger.ts` | `observe` | 단조 시계로 요청 시간 측정, 서버 UUID 발급, 응답 완료·중단 이벤트 구독, 한 번만 기록 |
| `src/controllers/http/HttpRequestLogContext.ts` | `attach/find/release`, `captureReply` | 응답별 WeakMap Context. 원본 패킷 대신 허용한 진단 필드만 보관 |
| `src/infrastructure/http/createSessionHttpServer.ts` | 요청 콜백, `setRoute` | 로거를 가장 바깥 HTTP 경계에 연결. 성공뿐 아니라 미등록 경로·파싱·인증 오류도 기록 |
| `src/controllers/SessionController.ts` | `room`, `submit` | Protobuf 해석 직후 방 번호·퍼즐 ID·답 개수 기록. 답 문자열은 전달하지 않음 |
| `src/controllers/http/ProtobufHttp.ts` | `write` | 직렬화할 응답에서 oneof·판정·snapshot을 읽어 기록. 바이너리 재파싱 없음 |
| `src/main.ts` | `new HttpAccessLogger(...)` | 유효한 토큰의 playerId/role을 읽기 전용으로 찾는 함수 주입. 로그 모듈은 GameSession·ParticipantRegistry를 직접 참조하지 않음 |
| `tests/http-access-log.test.cjs` | 실제 HTTP 검사 | 정상·실패·민감 값 제외·조기 종료·출력 실패가 게임에 미치는 영향 검사 |

이 파일들은 서버 프로젝트 루트 기준 경로입니다. 컴파일 결과는 같은 구조의 `dist/` 아래에 만들어집니다. 실행 코드는 소스가 아니라 `dist/main.js`이므로 로컬 실행에는 빌드, Docker에는 이미지 재빌드·교체가 필요합니다.

## 2. 이렇게 구성한 이유

### 2.1 라우터 바깥에서 시작하고 응답 이벤트에서 끝냅니다

개별 Controller에 console.log를 복사하면 새 API에서 빠뜨리거나 성공만 기록하기 쉽습니다. 공통 라우터 진입 시 로깅을 시작하고 ServerResponse의 finish/close 이벤트에서 기록하여 모든 라우트를 같은 기준으로 관찰합니다.

`finish`는 Node가 응답 쓰기를 완료한 시점입니다. 클라이언트가 내용을 실제로 수신·게임에 적용했음을 보장하지는 않습니다. 응답 쓰기 전에 연결이 끝나면 `aborted`로 기록합니다. finish 뒤 close가 와도 recorded 플래그와 이벤트 해제로 중복을 막습니다. 아직 헤더를 전송하지 않았다면 statusCode는 null입니다.

### 2.2 HTTP 성공과 게임 판정을 구분합니다

정상 오답·잠긴 문은 HTTP 200입니다. statusCode만 보면 성공처럼 보여 디버깅하기 어렵습니다. 다음 결과를 별도 result 필드로 기록합니다.

| result | 의미 |
|---|---|
| `success` | 입장·조회·ready·데이터·heartbeat·leave·운영 요청 정상 처리 |
| `correct` / `incorrect` | 정답 입력의 정상 정답 / 정상 오답 |
| `allowed` / `locked` | 문 사용 허가 / 정상 잠김 |
| `rejected` | 기존 puzzleId 제출 경로의 accepted=false |
| `failure` | 인증·미준비·잘못된 요청·서버 오류 등 실패 응답 |
| `aborted` | 응답 완료 전 연결 종료 |

7번 방의 BothSolved처럼 정답이 맞아도 문이 잠겨 있을 수 있으므로 correct와 doorAllowed를 별도 기록합니다. 서버가 해금 ID를 반환해도 클라의 프리팹 생성 성공까지 의미하지는 않습니다.

### 2.3 게임 규칙과 출력 기술을 분리합니다

도메인 모델·세션 서비스에는 로깅 의존성을 추가하지 않았습니다. HTTP Context는 전송 경계에서만 사용하며, `ILogSink`를 생성자 주입합니다. 현재 구현은 stdout Adapter이고, 향후 다른 출력 대상을 사용할 때 이 포트의 어댑터를 교체할 수 있습니다.

적용 방식은 명시적 DI, 응답 이벤트를 관찰하는 Observer, stdout 출력 Adapter입니다. 새 전역 이벤트 버스나 모든 게임 명령을 감싸는 Decorator 계층을 추가한 것은 아닙니다. 출력/식별 함수의 예외는 HTTP 처리를 실패시키지 않게 격리합니다. 출력 장애 때 로그 유실을 방지하는 영속 큐·재전송 기능까지 구현한 것은 아닙니다.

## 3. 기록하는 필드와 제외하는 값

| 필드 | 의미 |
|---|---|
| `event` | `http_access`: 후속 다른 종류의 진단 이벤트와 구분 |
| `message` | 한국어 처리 완료/연결 종료 설명 |
| `timestamp` | 기록 시각, UTC ISO8601. 끝의 Z는 UTC이며 한국 시간은 +9시간 |
| `requestId` | 서버가 요청마다 발급한 UUID. 응답의 X-Request-Id 헤더에도 전달 |
| `method`, `route`, `operation` | 메서드·생성 계약의 경로 템플릿·operationId. 원본 URL 대신 `/sessions/{sessionId}/rooms/door` 등 사용 |
| `sessionId`, `playerId`, `role` | 요청 시작 시 확인 가능한 참가자 또는 성공 응답의 정보. 무효·만료 토큰이면 생략될 수 있음 |
| `roomNo`, `puzzleId`, `answerCount` | 해석된 방/퍼즐 번호와 답의 개수. 본문 해석 전 실패하면 없는 것이 정상 |
| `statusCode`, `durationMs`, `completion` | 실제 전송 상태·단조 시계 정수 ms·finished/aborted |
| `outcome`, `result`, `failureCode` | Protobuf 결과 종류·게임 판정·서버 실패 코드 |
| `correct`, `accepted`, `doorAllowed` | 해당 API가 반환한 판정 값 |
| `phase`, `participantCount`, `unlockedRoomIds` | snapshot이 있는 응답의 게임 단계·인원·누적 해금 ID |

참가 토큰·Authorization·입력한 답 문자열·정답 데이터·원본 본문·CSV 번들·원본 URL/쿼리·클라이언트 IP는 저장하지 않습니다. 실패 요청의 임의 경로 문자열도 출력하지 않습니다. 참가자 식별은 요청 시작 시점의 유효 토큰 조회이며 인증 판정 자체는 기존 서비스가 수행합니다. 로그의 역할이 보인다고 해당 요청이 최종 승인됐다는 뜻은 아닙니다.

## 4. 로그 예시 읽기

아래는 필드 설명을 위한 축약 예시입니다. 실제 출력에는 requestId·timestamp·message 등 공통 필드가 함께 들어갑니다.

```json
{"event":"http_access","operation":"JoinSession","role":"B","statusCode":201,"result":"success"}
{"event":"http_access","operation":"SubmitRoomAnswer","role":"B","roomNo":1,"answerCount":4,"statusCode":200,"correct":false,"doorAllowed":false,"result":"incorrect"}
{"event":"http_access","operation":"SubmitRoomAnswer","role":"B","roomNo":1,"statusCode":200,"correct":true,"doorAllowed":true,"unlockedRoomIds":[1001,1002,1004],"result":"correct"}
{"event":"http_access","operation":"CheckRoomDoor","role":"A","roomNo":1,"statusCode":200,"doorAllowed":true,"result":"allowed"}
{"event":"http_access","operation":"CheckRoomDoor","roomNo":4,"statusCode":403,"failureCode":"INVALID_PARTICIPANT","result":"failure"}
```

예를 들어 B 3번 방 응답에서 `unlockedRoomIds`에 1008이 포함되면 서버가 B 4번 방을 허가한 것입니다. 이후 방이 보이지 않는 문제는 클라이언트 Player.log의 `방 4 로드 대기`와 프리팹/앵커 오류를 함께 확인해야 합니다. 클라이언트에서 생성 실패했다고 서버 접근 로그에 자동 기록되는 기능은 없습니다.

## 5. 배포와 클라우드 로그 확인

### 5.1 새 서버 이미지에 반영

서버 프로젝트 폴더에서 기존 도구를 실행합니다.

```powershell
.\deploy-cloud.cmd
```

이 문서 작업에서 실제 클라우드 배포를 자동 수행하지 않았습니다. 사용자님이 새 서버를 배포해야 클라우드 로그에 반영됩니다. 서버 재배포 시 메모리 세션이 초기화되므로 클라이언트는 재입장해야 합니다. 게임 API·Protobuf 계약은 변경하지 않아 이번 서버 로그 추가만으로 클라이언트를 새로 빌드할 필요는 없습니다.

### 5.2 로컬 PowerShell에서 실시간 보기

```powershell
ssh escape-cloud "docker logs --follow --timestamps --tail 100 escape-server-cloud"
```

로그는 서버 stdout에 출력되고 Docker가 관리합니다. 애플리케이션 전용 `.log` 파일을 컨테이너 안에 만들지 않습니다. Ctrl+C는 로그 보기를 끝내며 서버를 중지하지 않습니다.

입장·정답·문 요청만 추려 보려면 로컬 PowerShell에서 다음을 사용합니다.

```powershell
ssh escape-cloud "docker logs --follow --tail 100 escape-server-cloud" |
    Select-String '"operation":"(JoinSession|SubmitRoomAnswer|CheckRoomDoor|SubmitPuzzle)"'
```

최근 10분만 확인할 수도 있습니다.

```powershell
ssh escape-cloud "docker logs --since 10m --timestamps escape-server-cloud"
```

조회·heartbeat·health도 모두 기록하므로 테스트 시간이 길수록 로그가 늘어납니다. 2026-10-22에 기존 배포 도구에 Docker 로그 순환을 추가했습니다. 다음 배포에서 생성하는 컨테이너는 기본 json-file·파일당 10MB·최대 3개를 사용하고, `.env.deploy-*`의 LOG_MAX_SIZE_MB/LOG_MAX_FILES로 조정합니다. 자세한 내용은 [Docker 로그 용량 제한](docker-deployment.md)을 참고하십시오. 별도 Error 파일을 추가할 경우 해당 파일의 보존 정책은 따로 필요합니다. 기존 컨테이너를 제거하면 기존 컨테이너 로그도 계속 조회할 수 있다고 보장하지 않습니다. 필요한 테스트 기록은 교체 전에 보관합니다.

## 6. 현재 접근 로그와 후속 패킷 처리 추적의 구분

| 구분 | 이번 구현 | 후속 확장 지점 |
|---|---|---|
| 완료 결과 | 모든 HTTP 라우트의 요청당 한 줄 | 유지 |
| 상관관계 | requestId와 응답 헤더 | 처리 단계·백그라운드 작업에 같은 ID 전달 |
| 처리 단계 | 최종 outcome·판정만 수집 | 수신 → 디코딩 → 검증 → 인증 → 디스패치 → 도메인 판정 → 응답별 이벤트 |
| 전송 경계 | Node HTTP Observer | 다른 전송을 도입할 경우 별도 Adapter |
| 출력 경계 | ILogSink + ConsoleJsonLogSink | 파일·수집 서비스·비동기 큐 Adapter |
| 필드 정책 | 허용한 식별/결과 필드만 | 메시지 종류별 필드 정책·레벨·샘플링·보존 설정 |

후속 단계별 로그는 예를 들어 `event=packet_processing`, `stage=decoded/authenticated/handled` 등의 별도 이벤트 모델을 정의하고 동일 requestId로 연결할 수 있습니다. **이 이벤트 모델과 단계별 계측은 아직 구현하지 않았습니다.** 현재 ILogSink의 제네릭 계약과 요청 Context를 확장 기반으로 마련했습니다.

도메인 판정 알고리즘에 직접 콘솔 출력을 넣기보다 패킷 처리 조정기에서 완료 이벤트를 발행하고 로깅 Observer가 소비하게 하는 방향입니다. 전역 버스·범용 메시지 디스패처·영속 큐·raw 패킷 저장까지 이번 접근 로그에 함께 넣지 않습니다. 데이터 테이블의 콘텐츠 연결과 진단 로깅 설정도 별도 책임입니다.

## 7. 검사 결과

- TypeScript strict 빌드 성공.
- 신규 접근 로그 실제 HTTP 검사 **7개 통과**.
- 기존 검사를 포함한 서버 회귀 검사 **164개 통과**.
- 성공·정원 초과·정답/오답·문 허가/잠김·인증/본문 오류·모든 운영 경로·기존 puzzleId 경로를 검사했습니다.
- 토큰/답/본문/원본 URL 제외, requestId 대응, 완료/중단 단일 기록, 로그 출력·식별 실패 격리를 검사했습니다.
- 실제 클라우드 컨테이너 배포·Unity 두 PC 접속은 이 검사 결과에 포함하지 않습니다.
