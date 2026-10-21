# Docker 실행 파일 사용법과 코드 해설

## 실행 파일

| 목적 | Windows | Linux | 공통 명령 |
|---|---|---|---|
| 내 PC의 Docker 테스트 | run-docker-local.cmd | sh run-docker-local.sh | npm run docker:local |
| 내 PC에서 클라우드 Docker로 원격 배포 | deploy-cloud.cmd | sh deploy-cloud.sh | npm run docker:cloud |

Windows는 실행 파일을 더블클릭해도 됩니다. 실행이 끝나면 결과를 확인할 수 있도록 키 입력을 기다립니다.
Linux는 sh 명령을 사용하므로 실행 권한 변경 없이 호출할 수 있습니다. 어느 폴더에서 호출해도 프로젝트 루트를 기준으로 동작합니다.

실행 PC에는 Node.js 24 이상과 Docker CLI가 필요합니다. 로컬 테스트는 Docker Desktop/Engine이 실행 중이어야 합니다. 도구는 로컬 node_modules나 PowerShell 실행 정책에 의존하지 않습니다. TypeScript 빌드는 Dockerfile 안에서 수행합니다.

## 1. 로컬 Docker 테스트

다음 파일을 사용합니다.

- `.env.deploy-local`: 이미지 이름, 컨테이너 이름, 포트 등 배포 도구 설정.
- `.env.docker-test`: 컨테이너 내부에서 사용하는 서버 설정.

파일이 없으면 대응하는 `.example` 파일을 복사합니다. 실제 설정 파일은 Git에 올리지 않고 예제만 공유합니다.

기본 구성은 escape-server:lan-test 이미지, escape-server-lan-test 컨테이너, PC 3001 → 컨테이너 3000입니다. 별도 변경 없이 run-docker-local.cmd를 실행하면 됩니다.

같은 PC의 Unity는 http://127.0.0.1:3001, 다른 PC는 http://서버PC의실제IP:3001에 접속합니다. LAN 접근에는 방화벽 허용이 필요합니다.

Docker가 현재 원격 context로 선택되어 있다면 도구는 로컬 배포를 거부합니다. `docker context ls`로 로컬 이름을 확인하고 `.env.deploy-local`의 DOCKER_CONTEXT에 지정하세요. Windows Docker Desktop은 보통 desktop-linux, Linux는 보통 default입니다. 도구는 현재 context 설정 자체를 변경하지 않습니다.

실행 없이 설정만 확인하려면 다음을 사용합니다. --plan은 Docker에 접속하지 않으므로 엔진이나 SSH 연결까지 검사한 결과는 아닙니다.

```powershell
node scripts/deploy-docker.cjs local --plan
```

## 2. 내 PC에서 클라우드로 배포

클라우드 컴퓨터에 프로젝트를 먼저 복사할 필요는 없습니다. 사용자 PC의 Docker CLI가 SSH로 클라우드 Docker 엔진에 연결하고, 로컬 빌드 자료를 전달하여 클라우드에서 이미지를 빌드하고 실행합니다. 이미지 레지스트리는 이 경로에 필요하지 않습니다.

이 기능은 Docker의 SSH 원격 엔진 기능을 사용합니다. 별도 원격 셸 스크립트를 생성하거나 SSH 암호를 환경 파일에 저장하지 않습니다. SSH 계정은 원격 Docker를 실행할 수 있어야 합니다. [Docker 공식 SSH 연결 문서](https://docs.docker.com/engine/security/protect-access/)

클라우드 준비 조건:

1. Docker CLI와 Linux 컨테이너 엔진이 설치되어 실행 중이어야 합니다.
2. 사용자 PC에서 SSH 접속이 되어야 합니다. 키·계정·포트·호스트 확인을 먼저 완료합니다.
3. SSH로 실행한 Docker가 사용할 수 있어야 합니다. 매번 대화형 sudo 암호를 요구하는 상태는 이 배포 방식에 맞지 않습니다.
4. Docker 이미지 빌드에 필요한 인터넷 접근과 게임 포트/SSH 포트의 방화벽·클라우드 보안 규칙을 설정합니다.

실행 PC는 Windows/Linux 모두 같은 공통 코드를 사용합니다. 원격 대상은 SSH를 통해 Docker 명령을 실행할 수 있고 엔진이 linux라고 보고해야 합니다. 실제 원격 OS의 SSH 설정과 Docker 접근은 별도 준비 사항이며 이 도구가 설치하지 않습니다.

`.env.deploy-cloud`에서 다음 두 값을 실제 주소로 입력합니다.

```dotenv
SSH_TARGET=ssh://계정@클라우드호스트
PUBLIC_HEALTH_URL=http://클라우드호스트:3000/health
```

SSH 포트가 다르면 ssh://계정@호스트:포트 형태로 지정합니다. 키 파일은 `.env`에 넣지 않고 사용자 PC의 SSH config를 사용하세요. Windows의 일반적인 경로는 C:\Users\m\.ssh\config입니다.

```sshconfig
Host escape-cloud
    HostName 클라우드의실제IP
    User 실제접속계정
    IdentityFile C:/Users/m/.ssh/실제키파일
```

별칭을 사용하면 다음과 같이 설정합니다.

```dotenv
SSH_TARGET=ssh://escape-cloud
PUBLIC_HEALTH_URL=http://클라우드의실제IP:3000/health
```

사전 연결 확인 예시는 다음과 같습니다. 처음 접속할 때는 호스트 정보를 확인하고 SSH 인증을 완료하세요.

```powershell
ssh escape-cloud docker info
docker --host ssh://escape-cloud info
```

서버 내부 값은 `.env.docker-cloud`에서 별도로 설정합니다. 기본 HOST는 0.0.0.0, PORT는 3000입니다.
설정을 마쳤으면 deploy-cloud.cmd 또는 sh deploy-cloud.sh를 실행합니다. 사용자 PC의 Docker 엔진을 실행할 필요는 없지만 Docker CLI·빌드 플러그인과 SSH 클라이언트는 필요합니다.

기본 클라우드 컨테이너는 escape-server-cloud, 이미지 태그는 escape-server:cloud입니다. 호스트 3000 → 컨테이너 3000을 연결하고 restart=unless-stopped를 사용합니다. PUBLIC_HEALTH_URL은 사용자 PC에서 도달할 수 있는 실제 주소여야 합니다. 프록시를 둔 경우 외부 HTTPS /health 주소를 지정할 수 있습니다.

```powershell
node scripts/deploy-docker.cjs cloud --plan
```

SSH_TARGET과 PUBLIC_HEALTH_URL이 비어 있으면 실제 실행과 미리보기 모두 설정 오류로 종료합니다. 임의의 클라우드 주소를 사용하지 않습니다.

## 3. 공통 실행 순서

1. 환경 파일과 데이터 형식을 검사합니다.
2. local은 로컬 unix/npipe context인지 확인하고, cloud는 명시된 SSH 대상에 연결합니다.
3. Linux 컨테이너 엔진인지 확인합니다.
4. Dockerfile로 새 이미지를 빌드합니다. 이 단계까지 기존 컨테이너를 유지합니다.
5. 새 이미지에서 실제 loadServerConfig를 실행하여 환경변수와 내부 포트가 유효한지 검사합니다. HOST=0.0.0.0인지, PORT와 CONTAINER_PORT가 같은지도 확인합니다.
6. 설정한 이름에 정확히 일치하는 기존 컨테이너가 있으면 ID로 중지·제거합니다. 없으면 생략합니다.
7. 검증한 이미지 ID로 새 컨테이너를 실행합니다. 중간에 태그가 바뀌어도 검증한 이미지를 사용합니다.
8. 최근 로그를 출력하고 새 컨테이너 내부 /health 및 공개 주소 /health가 모두 status=ok인지 확인합니다.
9. 성공할 때만 배포 완료를 표시합니다. 실패 시 종료 코드 1과 진단 로그를 제공합니다.

빌드·서버 설정 검증이 실패하면 기존 컨테이너를 중지하지 않습니다. 교체 이후 실행/상태 확인 실패까지 자동으로 이전 컨테이너에 롤백하지는 않습니다. 실패한 새 컨테이너는 진단할 수 있도록 남겨 둡니다. 배포 중 잠시 중단되며 서버 메모리의 세션·토큰은 초기화됩니다. 클라이언트는 재입장해야 합니다.

이 도구는 한 대의 클라우드 Docker 호스트에 수동 실행으로 배포하는 기능입니다. Git push 기반 CI/CD, 클라우드 VM 생성, 여러 호스트 동시 배포, 무중단 교체는 포함하지 않습니다. 같은 컨테이너를 여러 PC에서 동시에 배포하지 않는 운영을 전제로 합니다.

## 4. 설정 항목

| 배포 설정 | 로컬 기본값 | 클라우드 기본값 | 의미 |
|---|---|---|---|
| DOCKER_CONTEXT | 현재 context 검사 | 사용 안 함 | 로컬 unix/npipe context만 허용 |
| SSH_TARGET | 사용 안 함 | 필수 입력 | ssh://계정@호스트[:포트] 또는 SSH 별칭 |
| IMAGE_NAME | escape-server:lan-test | escape-server:cloud | 환경별 이미지 태그 |
| CONTAINER_NAME | escape-server-lan-test | escape-server-cloud | 교체 대상 컨테이너 |
| RUNTIME_ENV_FILE | .env.docker-test | .env.docker-cloud | 로컬 PC에서 읽어 Docker에 전달하는 서버 환경 파일 |
| BIND_ADDRESS | 0.0.0.0 | 0.0.0.0 | Docker 호스트 포트 공개 주소 |
| HOST_PORT | 3001 | 3000 | Docker 호스트의 접속 포트 |
| CONTAINER_PORT | 3000 | 3000 | 컨테이너 내부 서버 PORT와 같아야 함 |
| RESTART_POLICY | no | unless-stopped | 컨테이너 재시작 정책 |
| PUBLIC_HEALTH_URL | 로컬 포트에서 계산 | 필수 입력 | 실행 PC에서 검사하는 /health 주소 |
| HEALTH_TIMEOUT_MS | 30000 | 30000 | 상태 검사 전체 제한 |
| HEALTH_INTERVAL_MS | 500 | 500 | 실패 후 재검사 간격 |
| HEALTH_REQUEST_TIMEOUT_MS | 2000 | 2000 | 각 검사 요청/명령의 최대 제한 |
| STOP_TIMEOUT_MS | 10000 | 10000 | 기존 컨테이너 종료 대기 시간 |

설정 파일은 Node의 .env 파서로 읽습니다. 환경변수 치환과 셸 명령은 실행하지 않습니다. 배포 설정은 선택한 파일이 기준이며 DOCKER_HOST/DOCKER_CONTEXT 같은 외부 환경변수로 대상을 바꾸지 않습니다. Docker 설정 파일과 SSH agent/config는 그대로 사용합니다.

서버 환경 파일은 Docker --env-file 형식입니다. KEY=value 형태로 작성하며 따옴표/셸 변수 치환에 기대지 않습니다. 예제의 정수 값처럼 작성하면 됩니다. 배포 도구 설정 파일은 컨테이너에 전달하지 않습니다. 서버 환경 파일 값은 정상 실행 로그에 통째로 출력하지 않습니다.

## 5. 코드 역할과 설계 의도

### 실행 파일 / deploy-docker.cjs

cmd와 sh는 현재 파일 위치를 기준으로 공통 도구를 호출하고 종료 코드만 전달합니다. OS별 파일에 Docker 배포 순서를 복사하지 않습니다. deploy-docker.cjs는 명령행 해석과 구체 구현을 조립하는 Composition Root입니다. --plan은 설정 확인과 실행 계획 출력만 수행합니다.

### DockerDeployConfig.cjs — 데이터 검증

선택한 환경 파일을 읽어 이미지/컨테이너 이름, 접속 방식, 포트, 주소, 정수 ms와 설정 간 관계를 검사한 불변 설정 객체를 만듭니다. 오타 난 키도 거부합니다. 클라우드 주소와 서버 환경 파일의 내용은 코드에 하드코딩하지 않습니다.

### DockerCli.cjs — OS·Docker 어댑터와 대상 Strategy

DockerCli는 shell=false와 인자 배열로 Docker를 실행합니다. 명령 문자열을 셸에 이어 붙이지 않습니다. LocalDockerTarget은 로컬 context를 확인하고, SshDockerTarget은 명시된 SSH 연결을 사용합니다. 두 Strategy가 대상 선택 차이를 흡수합니다.

외부 DOCKER_HOST/DOCKER_CONTEXT와 BUILDX_BUILDER/BUILDKIT_HOST/DOCKER_DEFAULT_PLATFORM은 자식 프로세스에서 제외합니다. 현재 context를 변경하지 않고 각 명령에 대상을 명시합니다. docker build는 선택한 엔진의 기본 빌더를 사용합니다. [Docker 기본 빌더 문서](https://docs.docker.com/build/builders/)

### DockerDeployment.cjs — 공통 배포 순서와 Facade

위 실행 순서를 한곳에서 관리합니다. 로컬/클라우드가 다른 중지·제거·실행 코드를 갖지 않습니다. Docker 실행기, 상태 검사기, 공개 health 함수와 로그 함수를 주입하므로 실제 클라우드 없이 실패 순서를 검사할 수 있습니다.

런타임 사전 검증은 이미지 내부의 기존 서버 검증기를 호출합니다. 서버의 생존 확인 설정 검증을 배포 도구에 다시 구현하지 않습니다. 컨테이너 교체 후 검사는 새 컨테이너 ID를 사용하여 이름이 재사용되어도 다른 컨테이너를 검사하지 않도록 합니다.

### HealthMonitor.cjs — 정수 ms 상태 검사

단조 증가 시계를 정수 ms로 변환해 제한 시간을 계산합니다. 재시도 간격과 요청 제한도 정수 ms입니다. Docker stop API가 초를 요구하는 지점에서만 ms를 정수 초로 올림 변환합니다.

프레젠테이션이나 게임 도메인 기능이 아니므로 전역 이벤트 버스를 추가하지 않았습니다. 배포 도구의 진행 로그와 명령 결과가 필요한 경계에 직접 전달됩니다.

### 변경하지 않은 영역

게임 세션 규칙, Unity 클라이언트, HTTP API, Dockerfile 실행 방식은 이번 변경의 대상이 아닙니다. .dockerignore에는 검사 산출물/문서를 추가로 제외하여 원격 빌드에 불필요한 자료를 보내지 않도록 했습니다.

## 6. 검증 범위

자동 검사는 실제 Docker에 변경을 가하지 않는 대역 실행기로 대상 분리, 정확한 교체 순서, 빌드/설정 실패 시 기존 컨테이너 보존, 최초 실행, 중지 실패 중단, 잘못된 엔진/교체 대상/새 실행 실패, 상태 확인 재시도/실패를 검사합니다. 사전 검증 코드는 실제 컴파일된 서버 검증기로도 확인합니다.

실제 로컬 Docker는 별도 임시 이미지와 컨테이너로 최초 배포, 재배포에 의한 컨테이너 교체, 내부/공개 상태 확인을 검사하고 해당 검사 자원만 정리합니다. 사용자님의 기존 escape-server-lan-test 컨테이너를 교체하는 검사가 아닙니다.

2026-10-21에 기존 EC2의 SSH·원격 Docker 연결, 실제 이미지 빌드·컨테이너 실행, EC2 호스트 내부의 /health 응답을 확인했습니다. 공개 /health 검사는 TCP 3000 보안 그룹 미설정 상태에서 제한 시간 내 통과하지 못했습니다. 현재 주소와 사용자님 PC의 실행 순서는 [EC2 배포 가이드](ec2-deployment-guide.md)를 참고하십시오.
