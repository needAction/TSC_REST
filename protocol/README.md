# Protobuf 계약과 코드 생성

현재 게임 HTTP API는 Google Protobuf 바이너리이며 Unity에는 생성 코드와 Google.Protobuf 런타임이 구성되어 있습니다. 운영 확인 /health와 계약 /openapi.json은 JSON입니다. 최신 코드·검사·자동 생성 배포는 [문·정답 API 안내](../docs/room-api-and-protobuf.md)를 참고합니다.

## 계약의 기준

- 메시지 원본은 escape/v1/common.proto, session.proto, game_api.proto이며 HTTP 바인딩은 http/openapi.json입니다.
- 생성 파일은 직접 편집하지 않습니다.
- 필드 번호·enum 숫자의 의미를 유지하고, 삭제 시 번호와 이름을 reserved로 남깁니다.
- Phase/Role/Error의 0은 미지정입니다. 오류 0과 알 수 없는 값은 도메인 검증에서 거부해야 합니다.
- 조회의 outcome은 snapshot 또는 failure이며, 미지정 outcome도 수신 검증에서 거부해야 합니다.
- Protobuf 파싱 성공은 인증·정원·게임 상태 규칙의 검증 성공을 뜻하지 않습니다.
- 전송 메시지와 GameSession/ClientSessionState 런타임 상태는 변환 어댑터로 분리합니다.

## 도구

Node.js 24 이상, 코드 생성·교차 검증용 .NET SDK 10이 필요합니다.
.NET SDK는 게임 서버 실행 자체에는 필요하지 않습니다.

| 도구 | 고정 버전 | 용도 |
|---|---|---|
| ts-proto | 2.15.0 | TypeScript 생성, oneof 판별 유니온 |
| @bufbuild/protobuf | 2.14.1 | TypeScript 바이너리 런타임 |
| Grpc.Tools | 2.76.0 | protoc 31.1 도구 공급 |
| Google.Protobuf | 3.33.0 | C# 바이너리 런타임 |

Grpc.Tools는 여기서 컴파일러 공급 용도이며 gRPC 서버·클라이언트를 생성하지 않습니다.
npm package-lock.json과 C# packages.lock.json을 공유하고, NuGet 복원은 잠금 모드를 사용합니다.

## 실행

서버 프로젝트에서 최초 한 번:

```text
npm ci
npm run proto:setup
```

계약 변경 후 양쪽 코드 생성:

```text
npm run proto:generate
```

생성·컴파일·C#/TypeScript 바이너리 교차 검증:

```text
npm run proto:verify
```

공통 Node 스크립트가 OS별 protoc 실행 파일만 선택합니다. Windows x64에서 검증했습니다.
Linux x64/arm64의 도구 선택도 구성했지만 실제 Linux 실행은 아직 검증하지 않았습니다.
도구가 없는 OS/CPU에서는 생성이 실패하며 다른 도구로 자동 대체하지 않습니다.

## 출력과 검증

- TypeScript: src/generated/escape/v1/common.ts, session.ts
- C#: protocol/generated/csharp/Common.cs, Session.cs
- 교차 검증: protocol/verification/csharp의 별도 콘솔 프로그램
- 다운로드·임시 바이너리: .protocol-tools/ (Git 제외)

검증은 TS → C# → TS 및 C# → TS의 메시지 의미를 비교합니다.
성공/실패, 배열, enum, true/false, 미지정 oneof, 0값, 미지 enum, oneof 최종 분기,
잘린 메시지 거부를 확인합니다. HTTP 통신·실제 Unity 실행·IL2CPP 검증은 다음 단계입니다.

Windows Unity 설치의 .NET Standard 2.1 참조 환경에서 추가 컴파일:

```powershell
.\protocol\verification\verify-unity.ps1 -UnityEditorPath 'C:\Program Files\Unity\Hub\Editor\6000.2.8f1\Editor'
```

Google.Protobuf의 .NET Standard 2.0을 Unity 2.1 참조에 연결하므로 CS1701 경고가 발생할 수 있습니다.
이 검사는 생성 코드 컴파일 확인이며, Unity에 DLL을 설치하거나 런타임 동작을 확인하지 않습니다.

## 다음 단계

서버·Unity 생성 코드 배포 도구의 경로 설정과 실행은 TOOL.md에 있습니다.

게임 API 전환과 생성 배포를 완료했습니다. 다음 단계는 1인칭 플레이어와 CSV 기반 문·정답 입력 UI를 공개 게임 계약에 연결하고 실제 Unity Play/빌드를 확인하는 것입니다.
