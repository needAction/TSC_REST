# 2인 네트워크 방탈출 서버

현재는 단일 메모리 세션의 입장과 씬 로딩 완료 보고를 처리하는 HTTP 프로토타입입니다.
서버 재시작 시 세션과 토큰은 초기화됩니다. Docker·클라우드 자동 배포는 아직 구현하지 않았습니다.

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
- GET /health: 프로세스 응답 확인.

인원 부족은 Waiting, 정원 충족 후 로딩 중은 Loading, 모두 로딩 완료하면 Playing입니다.
ready는 대기실 준비 버튼이 아닙니다. SessionSnapshot은 sessionId, phase, players를 반환합니다.
조회 성공은 200, 토큰 헤더 누락은 400, 잘못된 토큰은 403, 없는 세션은 404입니다.
스냅샷에는 참가 토큰이 포함되지 않습니다. 조회 응답은 Cache-Control: no-store입니다.
클라이언트는 수동 조회로 상태를 갱신하며, 자동 주기 조회·푸시는 아직 없습니다.
퇴장·재접속·게임 명령 동기화는 후속 작업입니다.

## Protobuf 준비

공유 계약과 C#·TypeScript 생성·교차 검증을 구성했습니다.
현재 HTTP API는 JSON입니다. 설치·생성·검증 명령은 protocol/README.md에 있습니다.
