# 2인 네트워크 방탈출 서버

현재는 단일 메모리 세션의 입장, 씬 로딩 완료 보고, 정상 퇴장, 생존 확인과 참가자 만료를 처리하는 HTTP 프로토타입입니다.
서버 재시작 시 세션과 토큰은 초기화됩니다. 로컬 Docker 실행과 원격 SSH 배포 실행 파일을 구성했으며 실제 클라우드 배포 검증과 Git 기반 CI/CD는 후속 작업입니다.

## 실행 준비

Windows와 Linux 모두 Node.js 24 이상과 npm이 필요합니다.
프로젝트를 처음 받은 경우 서버 폴더에서 `npm ci`를 실행하세요.
다른 OS로 옮길 때는 node_modules를 복사하지 않고 해당 OS에서 설치하세요.

`.env.local.example`을 `.env.local`로, `.env.test.example`을 `.env.test`로 복사합니다.
실제 환경 파일은 Git에서 제외하고 예제 파일만 공유합니다.

## 실행

| 환경 | Windows | Linux | OS 공통 |
|---|---|---|---|
| 로컬 개발 | run-local.cmd 더블클릭 | sh run-local.sh | npm run run:local |
| 두 PC 테스트 | run-test.cmd 더블클릭 | sh run-test.sh | npm run run:test |

실행 파일은 어느 작업 폴더에서 호출해도 프로젝트 폴더를 기준으로 동작합니다.
공통 scripts/run.cjs가 환경 파일 확인 → 빌드 → 설정 검증 → 서버 실행을 처리합니다.
빌드 실패 시 기존 dist를 실행하지 않습니다. 종료는 Ctrl+C입니다.
Windows 실행 파일은 종료 후 메시지 확인을 위해 키 입력을 기다립니다.

local/test는 실행 목적이며 OS 이름과 무관합니다.
test는 테스트용 서버 실행이지 자동 테스트 명령이 아닙니다. 자동 검증은 `npm test`입니다.

## 환경변수

| 변수 | 로컬 예제 | 테스트 예제 | 의미 |
|---|---|---|---|
| HOST | 127.0.0.1 | 0.0.0.0 | 서버가 요청을 받을 IP 주소 |
| PORT | 3000 | 3001 | 서버 포트, 1~65535 |
| PARTICIPANT_TIMEOUT_MS | 10000 | 10000 | 마지막 생존 확인 수신 이후 만료 시간, 양의 안전한 정수 ms |
| EXPIRATION_CHECK_INTERVAL_MS | 500 | 500 | 만료 검사 주기, 1~2147483647 정수 ms, 만료 시간 이하 |

생존 확인 설정이 없는 기존 환경 파일도 위 기본값으로 동작합니다. 명시된 값이 빈 문자열·소수·음수이거나 범위를 벗어나면 시작을 거부합니다.

OS·실행 환경에서 이미 지정된 환경변수가 환경 파일보다 우선합니다.
Node의 기본 .env 파서를 사용하며 `$VAR` 치환이나 셸 명령 실행은 지원하지 않습니다.
파일 누락 또는 잘못된 주소·포트는 오류로 처리하며 다른 환경으로 자동 대체하지 않습니다.
전체 환경 파일 내용이나 토큰은 실행 로그에 출력하지 않습니다.

같은 PC에서는 http://127.0.0.1:3000/health로 확인합니다.
테스트에서는 다른 PC가 http://서버PC의실제IP:3001/health에 접근합니다.
0.0.0.0은 수신 주소이며 클라이언트 접속 주소가 아닙니다. 방화벽 허용은 별도로 필요합니다.

## 책임과 현재 API

실행 스크립트는 프로세스와 환경 파일을, ServerConfig는 설정 검증을 담당합니다.
Controller는 HTTP 변환, Service는 참가자 토큰 확인, GameSession은 세션 규칙을 담당합니다.

- POST /sessions/join: 두 명까지 입장, 역할 A/B와 참가 토큰 발급.
- POST /sessions/{sessionId}/ready: x-participant-token 헤더로 씬 로딩 완료 보고.
- GET /sessions/{sessionId}: 같은 참가 토큰 헤더로 최신 스냅샷 조회. 로딩 상태는 변경하지 않습니다.
- POST /sessions/{sessionId}/heartbeat: 같은 참가 토큰 헤더로 생존 시간만 갱신. 본문 없이 요청하고 성공은 200, {"success":true}입니다.
- POST /sessions/{sessionId}/leave: 같은 참가 토큰 헤더로 본인의 자리와 토큰을 즉시 제거. 성공은 200, {"success":true}입니다.
- GET /health: 프로세스 응답 확인.

인원 부족은 Waiting, 정원 충족 후 로딩 중은 Loading, 모두 로딩 완료하면 Playing입니다.
ready는 대기실 준비 버튼이 아닙니다. SessionSnapshot은 sessionId, phase, players를 반환합니다.
조회 성공은 200, 토큰 헤더 누락은 400, 잘못된 토큰은 403, 없는 세션은 404입니다.
스냅샷에는 참가 토큰이 포함되지 않습니다. 조회 응답은 Cache-Control: no-store입니다.
준비 보고·조회·생존 확인·퇴장은 공통 ParticipantHttpHandler로 헤더 확인과 200/400/403/404 응답을 처리합니다.
유효한 생존 확인만 만료 시간을 갱신합니다. 조회, 준비 보고, health, 실패한 생존 확인은 갱신하지 않습니다.
만료된 토큰은 주기 검사 전이라도 거부하고, 늦은 생존 확인으로 복구하지 않습니다. 실패 코드는 INVALID_PARTICIPANT입니다.

## 참가자 만료와 실행 수명

ParticipantRegistry가 토큰과 HeartbeatLease를, GameSession이 역할과 준비 상태를 소유합니다.
SessionService는 공통 제거 함수로 토큰과 게임 자리를 함께 정리합니다. 남은 참가자의 준비 상태는 유지되고 인원 부족 시 Waiting이 됩니다.
새 참가자는 비어 있는 역할을 받습니다. 새 입장과 인증 요청 때도 만료 대상을 정리합니다.

서버 수신 시작 후 PeriodicTask가 설정 간격마다 expireParticipants를 호출합니다. 요청이 없어도 정리합니다.
PeriodicTask는 IIntervalScheduler에 의존하며 NodeIntervalScheduler만 Node의 setInterval/clearInterval을 사용합니다.
중복 시작·중지는 안전하고, 서버 close 또는 SIGINT/SIGTERM 종료 시 예약을 해제합니다.
서비스는 타이머나 운영체제를 모르며 기존 단조 증가 시계의 정수 ms로 만료를 판단합니다.
기본 설정에서 10000ms 이후 다음 500ms 검사 시 정리합니다. Node 이벤트 루프가 지연되면 실제 정리도 늦을 수 있으며 정확한 실시간 실행을 보장하지 않습니다.

Unity에는 3000ms 생존 확인과 마지막 정상 생존 응답 이후 10000ms 연결 종료, 별도 알림창을 연결했습니다.
클라이언트 일반 요청과 생존 확인은 공통 요청 실행기 안에서 경로별 하나씩 실행하며 종료 시 함께 취소합니다.
에디터에서 두 참가자 유지, 한쪽 중단 후 만료, 대체 참가자 입장과 서버 중단 알림을 검증했습니다.
기존 Windows 빌드에는 새 코드가 없으므로 Docker·두 PC 검사는 클라이언트 재빌드와 새 서버 이미지 적용 후 진행합니다.
정상 퇴장은 구현했습니다. 기존 참가자의 재접속/복구와 게임 명령 동기화는 후속 작업입니다.

## 정상 퇴장과 Vivox 자동 연결

퇴장 API는 인증된 참가자의 자리만 제거합니다. 중복 퇴장/폐기된 토큰은 403이며 새 참가자에게 재사용된 자리를 제거하지 못합니다.
Unity의 나가기 버튼은 진행 중인 조회·보고·생존 확인을 취소하고 독점 퇴장 요청을 보냅니다.
응답을 못 받아도 로컬 연결은 정리하며, 서버에 남은 자리는 기존 생존 확인 만료가 정리합니다.
강제 종료 시 HTTP 퇴장 요청의 전달을 보장하지 않습니다.

서버 시작마다 session-UUID 형태의 세션 ID를 발급합니다. 클라이언트는 입장 응답의 ID를 사용하며 고정 session-001을 가정하지 않습니다.
Unity 음성 모듈은 이 ID에서 같은 Vivox 채널명을 계산합니다. 다른 서버 실행의 채널 충돌을 방지하며 localhost/LAN 접속 주소 차이에 영향받지 않습니다.
한 서버 프로세스에서 두 명이 모두 퇴장한 뒤에도 세션 ID는 유지됩니다. 매 게임마다 새 방을 생성하는 기능은 아직 없습니다.

게임 StateChanged → SessionVoiceCoordinator → IVoiceChatService → Vivox 어댑터 순서로 자동 연결합니다.
음성 상태/UI는 별도 공개 계약을 사용하고 SDK 참조는 어댑터 한 곳에 둡니다. 음성 실패가 게임 세션을 직접 종료하지 않습니다.
현재 SampleScene의 SessionJointest에만 VoiceBootstrapper가 있으며, 같은 Editor의 보조 객체에는 없습니다.
Unity Authentication의 익명 인증을 사용하며 동일 Unity Cloud 프로젝트의 Vivox 설정이 필요합니다.
실제 초기화·로그인·AudioOnly 채널 입장, 정상 퇴장 후 로그아웃, 재입장, 서버 중단 후 음성 종료를 Editor에서 확인했습니다.
새 Windows 빌드의 두 PC 간 실제 음성 송수신은 별도로 확인해야 합니다. 기존 수동 Vivox 샘플 검증과 이번 자동 연결 검증은 구분합니다.

파일별 변경 의도와 검사 순서는 [정상 퇴장·음성 자동 연결 해설](docs/session-leave-and-voice.md)에 있습니다.
새 Windows 빌드의 준비, 두 PC 테스트 순서, 단계별 통과 기준과 결과 기록표는 [두 PC 클라이언트 빌드 테스트 가이드](docs/client-build-test-guide.md)에 있습니다.

## 로컬 Docker 테스트 설정

`.env.docker-test.example`을 `.env.docker-test`로 복사합니다. 컨테이너 내부 PORT는 3000입니다.

환경별 실행 파일을 사용하면 빌드 → 설정 검증 → 기존 컨테이너 중지·제거 → 새 실행 → 로그 → 상태 확인을 한 번에 진행합니다.

| 목적 | Windows | Linux | 공통 명령 |
|---|---|---|---|
| 로컬 Docker 테스트 | run-docker-local.cmd | sh run-docker-local.sh | npm run docker:local |
| 내 PC에서 클라우드 원격 배포 | deploy-cloud.cmd | sh deploy-cloud.sh | npm run docker:cloud |

`.env.deploy-local.example`/`.env.deploy-cloud.example`을 각각 확장자 .example을 제거하여 복사합니다.
클라우드 서버 값은 `.env.docker-cloud.example`을 `.env.docker-cloud`로 복사합니다.
기존 실제 환경 파일은 덮어쓰지 않습니다. 이번 작업 PC에는 이 설정 파일들을 준비했습니다.

로컬은 기본 PC 3001 → 컨테이너 3000을 사용합니다. cloud는 `.env.deploy-cloud`의 SSH_TARGET과 PUBLIC_HEALTH_URL을 실제 주소로 입력해야 실행됩니다.
클라우드 실행 파일도 사용자 PC에서 실행하며, 빌드와 컨테이너 작업은 SSH로 연결된 클라우드 Docker에서 수행합니다. SSH 및 Docker 접근 권한은 사전 설정해야 합니다.
Node.js 24+, Docker CLI가 필요하며 로컬 설치 node_modules 없이 Dockerfile 안에서 TypeScript를 빌드합니다.
설정과 실행 순서, 실패 동작은 [Docker 배포 도구 안내](docs/docker-deployment.md)에 있습니다.

실행 없이 계획만 확인할 수 있습니다. cloud는 필수 주소 설정 후 미리보기가 가능합니다.

```powershell
node scripts/deploy-docker.cjs local --plan
node scripts/deploy-docker.cjs cloud --plan
```

수동 실행이 필요한 경우 기존 명령도 사용할 수 있습니다.

```powershell
docker build -t escape-server:lan-test .
docker run -d --name escape-server-lan-test --env-file .env.docker-test -p 3001:3000 escape-server:lan-test
```

두 PC는 http://서버PC의실제IP:3001에 접속합니다. 동일 이름 컨테이너가 이미 있으면 위 run 명령은 실패합니다.
기존 실행 컨테이너에는 소스 변경이 반영되지 않으므로 새 이미지로 컨테이너를 교체해야 합니다.
자동 검사는 `npm.cmd test`(Windows PowerShell) 또는 `npm test`로 실행합니다.

## Protobuf 준비

공유 계약과 C#·TypeScript 생성·교차 검증을 구성했습니다.
현재 HTTP API는 JSON입니다. 설치·생성·검증 명령은 protocol/README.md에 있습니다.
