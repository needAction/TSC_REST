# 서버·Unity Protobuf 배포 도구

계약 원본은 protocol/escape/v1입니다. 이 도구는 생성 메시지를 배포하며,
Unity 런타임 DLL 설치는 수행하지 않습니다. 현재 게임 API는 Protobuf로 전환되어 있습니다. OpenAPI 호출 바인딩도 생성하며, 새 `npm run api:sync -- --apply`는 기존 생성·교차 검사에 C# 클라이언트/TS 서버 실제 HTTP 검사를 더한 뒤 로컬 배포합니다.

## Swagger 문서 갱신

HTTP 계약 원본은 `protocol/http/openapi.json`, 메시지 원본은 `protocol/escape/v1/*.proto`입니다. 문서용 한글 설명과 proto 설명 모델을 갱신한 뒤 기존 생성 도구로 서버에 반영합니다.

```powershell
npm.cmd run api:docs:update
npm.cmd run proto:sync -- --target server --apply
npm.cmd run api:docs:verify
```

`/health`와 `/openapi.json`은 `x-codegen-exclude=true`로 문서에만 포함되어 기존 게임 호출 9개를 늘리지 않습니다. 실제 통신 계약 변경 시에는 기존 `api:sync -- --apply`로 Unity까지 생성·검사합니다. 서버 실행 후 `/swagger/`로 조회하며 Protobuf 실행 버튼은 제공하지 않습니다. [상세 사용 안내](../docs/swagger-api-guide.md).

## 프로젝트 경로 설정

프로젝트 루트의 protocol.projects.example.json을 protocol.projects.local.json으로 복사합니다.
serverProject, clientProject는 설정 파일 위치 기준 상대 경로 또는 절대 경로입니다.
설정 파일은 Git에서 제외됩니다. 현재 PC 경로는 실제 local 설정에만 있습니다.

서버 대상은 package.json, tsconfig.json과 @bufbuild/protobuf 의존성을 확인합니다.
클라이언트 대상은 ProjectSettings/ProjectVersion.txt를 확인합니다.
생성 배포 위치는 서버 src/generated, Unity Assets/3.Script/Generated/Protocol입니다.

## 실행 명령

최초 준비: npm ci → npm run proto:setup

```text
npm run proto:sync
```

위 명령은 임시 생성 → TS/C# 컴파일 → 바이너리 교차 검증 → 변경 예정 목록까지 실행합니다.
대상 프로젝트에 실제로 쓰려면 명시적으로 --apply를 사용합니다.

```text
npm run proto:sync -- --apply
npm run proto:sync -- --target server --apply
npm run proto:sync -- --target client --apply
```

Windows에서 proto-sync.cmd 더블클릭은 미리보기입니다.
터미널에서는 proto-sync.cmd --apply, Linux에서는 sh proto-sync.sh --apply로 적용합니다.
OS 실행 파일은 공통 Node 도구에 인자만 전달합니다.

검증만 수행: npm run proto:check
마지막 검증 결과를 다시 생성하지 않고 배포: npm run proto:deploy -- --apply
다른 설정: npm run proto:sync -- --config 경로/설정.json --apply

## 단계와 책임

- scripts/proto-tool.cjs: 전체 과정 조립, 설정, 검증 결과 확인.
- scripts/generate-protocol.cjs: protoc를 이용한 언어별 생성.
- scripts/verify-protocol.cjs: 스테이징된 코드의 컴파일과 교차 검증.
- scripts/protocol-tool/Deployment.cjs: 서버/Unity 대상 어댑터와 배포·백업·복구.

sync는 .protocol-tools/stages 아래의 새 폴더에 생성하므로 검증 실패 시 대상 생성 코드는 바뀌지 않습니다.
계약, 잠금 파일, 생성/검증 스크립트가 바뀌거나 검증 후 생성물이 수정되면 deploy를 거부합니다.
이 검증 기록은 로컬 작업 도구용이며 외부 공격에 대한 서명 체계는 아닙니다.

## 파일 소유권과 복구

각 대상의 protocol.manifest.json에 계약 해시, 도구 정보, 파일별 해시를 기록합니다.
최초 배포는 생성기 주석이 있는 기존 생성 파일만 인계받습니다.
이후 수동 수정된 생성 파일, 비관리 파일 충돌, 이전 배포의 폐기 파일은 배포를 중단합니다.
폐기 파일은 자동 삭제하지 않습니다. 파일과 Unity 참조를 수동 검토한 뒤 정리해야 합니다.

배포 전 기존 파일은 .protocol-tools/backups/<배포ID>에 보관합니다.
restore.json은 각 원본 경로와 백업을 기록합니다. 백업 자동 복원 명령은 아직 없습니다.
프로세스가 처리 가능한 중간 쓰기 오류는 적용한 파일을 되돌립니다.
프로세스 강제 종료·전원 장애에 대한 완전한 트랜잭션은 보장하지 않습니다.
각 파일은 임시 파일을 준비한 뒤 교체하며 .meta와 비관리 파일을 수정하지 않습니다. Windows Git의 LF/CRLF 변환만 동일 내용으로 인정하고 실제 코드 변경은 차단합니다. 계획 이후 변경 검사는 정확한 바이트 해시로 유지합니다.
계획 이후 외부 변경을 발견하면 적용을 중단합니다.

## Unity 어셈블리 활성화

전용 asmdef는 ESCAPE_PROTOBUF_RUNTIME 정의를 요구합니다. 현재 Unity 프로젝트에는 Google.Protobuf.dll과 Standalone 정의가 구성되어 있습니다. 새 작업자나 다른 플랫폼도 런타임 DLL·의존성과 해당 정의를 확인해야 합니다. 게임 네트워크 어댑터가 생성 메시지를 사용하므로 런타임 구성이 필요합니다.

## 검증 범위

Windows에서 실제 생성·컴파일·교차 검증·양쪽 배포와 반복 미리보기를 확인합니다.
Linux 실행과 실제 Unity Protobuf 런타임 동작은 별도 검증이 필요합니다.
배포 캐시·백업은 Git에 올리지 않고, .proto·생성 코드·대상 manifest·도구 설정 예제는 공유합니다.
