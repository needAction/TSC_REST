# 서버·Unity Protobuf 배포 도구

계약 원본은 protocol/escape/v1입니다. 이 도구는 생성 메시지를 배포하며,
HTTP API 전환이나 Unity 런타임 DLL 설치는 수행하지 않습니다.

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
각 파일은 임시 파일을 준비한 뒤 교체하며 .meta와 비관리 파일을 수정하지 않습니다.
계획 이후 외부 변경을 발견하면 적용을 중단합니다.

## Unity 어셈블리 활성화

Google.Protobuf 런타임이 아직 없으므로 전용 asmdef의 defineConstraints에
ESCAPE_PROTOBUF_RUNTIME을 지정해 생성 코드를 비활성 상태로 배포합니다.
정의가 없는 동안 Unity는 해당 어셈블리를 컴파일하지 않습니다.
다음 런타임 설치 단계에서 필요한 DLL과 의존성을 확인하고 심볼을 활성화합니다.
지금 생성물은 준비됐지만 게임 코드에서 사용 가능한 상태는 아닙니다.

## 검증 범위

Windows에서 실제 생성·컴파일·교차 검증·양쪽 배포와 반복 미리보기를 확인합니다.
Linux 실행과 실제 Unity Protobuf 런타임 동작은 별도 검증이 필요합니다.
배포 캐시·백업은 Git에 올리지 않고, .proto·생성 코드·대상 manifest·도구 설정 예제는 공유합니다.
