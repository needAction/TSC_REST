param(
    [Parameter(Mandatory)][ValidateSet('Client','Server')][string]$Project,
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$script:ink = '#183045'
$script:line = '#506f85'
$script:fontFamily = 'Malgun Gothic'

function Escape-Xml([string]$value) { [Security.SecurityElement]::Escape($value) }
function New-Diagram([string]$title, [string]$subtitle, [int]$height = 1100) {
    $script:width = 1600
    $script:height = $height
    $script:bitmap = [Drawing.Bitmap]::new($script:width,$height)
    $script:g = [Drawing.Graphics]::FromImage($script:bitmap)
    $script:g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $script:g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $script:g.Clear([Drawing.Color]::White)
    $script:svg = [Text.StringBuilder]::new()
    [void]$script:svg.AppendLine("<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='$height' viewBox='0 0 1600 $height' role='img'>")
    [void]$script:svg.AppendLine("<title>$(Escape-Xml $title)</title><desc>$(Escape-Xml $subtitle)</desc><rect width='1600' height='$height' fill='white'/>")
    [void]$script:svg.AppendLine("<defs><marker id='arrow' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='9' markerHeight='9' orient='auto-start-reverse'><path d='M 0 0 L 10 5 L 0 10 z' fill='$script:line'/></marker></defs>")
    Add-Text $title 60 35 1480 52 32 -Bold
    Add-Text $subtitle 60 96 1480 42 20
}
function Add-Text([string]$Text,[float]$X,[float]$Y,[float]$W,[float]$H,[float]$Size = 20,[switch]$Bold,[switch]$Center) {
    $style = if($Bold) {[Drawing.FontStyle]::Bold} else {[Drawing.FontStyle]::Regular}
    $font = [Drawing.Font]::new($script:fontFamily,$Size,$style,[Drawing.GraphicsUnit]::Pixel)
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($script:ink))
    $format = [Drawing.StringFormat]::new()
    $format.Alignment = if($Center) {[Drawing.StringAlignment]::Center} else {[Drawing.StringAlignment]::Near}
    $format.LineAlignment = [Drawing.StringAlignment]::Center
    $rect = [Drawing.RectangleF]::new($X,$Y,$W,$H)
    # 고정 줄 단위로 높이를 측정하여 PNG와 SVG에서 잘림을 방지합니다.
    $needed = $script:g.MeasureString($Text,$font,[int]$W,$format)
    if($needed.Height -gt $H + 3) {throw "Text exceeds diagram box: $Text"}
    $script:g.DrawString($Text,$font,$brush,$rect,$format)
    $anchor = if($Center) {'middle'} else {'start'}
    $tx = if($Center) {$X+$W/2} else {$X}
    $lines = $Text -split "`n"
    $lineHeight = $Size*1.45
    $ty = $Y + ($H - $lines.Count*$lineHeight)/2 + $Size
    $weight = if($Bold) {'600'} else {'400'}
    [void]$script:svg.AppendLine("<text x='$tx' y='$ty' fill='$script:ink' font-family='Malgun Gothic, Noto Sans KR, sans-serif' font-size='$Size' font-weight='$weight' text-anchor='$anchor'>")
    foreach($lineText in $lines) {
        [void]$script:svg.AppendLine("<tspan x='$tx' y='$ty'>$(Escape-Xml $lineText)</tspan>")
        $ty += $lineHeight
    }
    [void]$script:svg.AppendLine('</text>')
    $format.Dispose();
    $brush.Dispose();
    $font.Dispose()
}
function Add-Box([float]$X,[float]$Y,[float]$W,[float]$H,[string]$Title,[string]$Body,[string]$Fill = '#eef5fa') {
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($Fill))
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#c1cfda'),1.5)
    $script:g.FillRectangle($brush,$X,$Y,$W,$H)
    $script:g.DrawRectangle($pen,$X,$Y,$W,$H)
    [void]$script:svg.AppendLine("<rect x='$X' y='$Y' width='$W' height='$H' rx='8' fill='$Fill' stroke='#c1cfda' stroke-width='1.5'/>")
    Add-Text $Title ($X+12) ($Y+12) ($W-24) 37 22 -Bold -Center
    Add-Text $Body ($X+14) ($Y+49) ($W-28) ($H-53) 18 -Center
    $brush.Dispose();
    $pen.Dispose()
}
function Add-Arrow([double[][]]$Points,[string]$Label = '',[float]$LabelX = 0,[float]$LabelY = 0,[float]$LabelW = 0) {
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml($script:line),2.4)
    $cap = [Drawing.Drawing2D.AdjustableArrowCap]::new(5,6,$true)
    $pen.CustomEndCap = $cap
    $drawingPoints = [Drawing.PointF[]]@($Points | ForEach-Object {[Drawing.PointF]::new($_[0],$_[1])})
    $script:g.DrawLines($pen,$drawingPoints)
    $coords = ($Points | ForEach-Object {"$($_[0]),$($_[1])"}) -join ' '
    [void]$script:svg.AppendLine("<polyline points='$coords' fill='none' stroke='$script:line' stroke-width='2.4' marker-end='url(#arrow)'/>")
    if($Label) { Add-Text $Label $LabelX $LabelY $LabelW 36 19 -Center }
    $pen.Dispose();
    $cap.Dispose()
}
function Add-LifeLine([float]$X,[float]$Start,[float]$End) {
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#b3c2ce'),1.5)
    $pen.DashStyle = [Drawing.Drawing2D.DashStyle]::Dash
    $script:g.DrawLine($pen,$X,$Start,$X,$End)
    [void]$script:svg.AppendLine("<line x1='$X' y1='$Start' x2='$X' y2='$End' stroke='#b3c2ce' stroke-width='1.5' stroke-dasharray='7 6'/>")
    $pen.Dispose()
}
function Save-Diagram([string]$Name) {
    [void]$script:svg.AppendLine('</svg>')
    [IO.File]::WriteAllText((Join-Path $outputRoot "$Name.svg"),$script:svg.ToString(),[Text.UTF8Encoding]::new($false))
    $script:bitmap.Save((Join-Path $outputRoot "$Name.png"),[Drawing.Imaging.ImageFormat]::Png)
    $script:g.Dispose();
    $script:bitmap.Dispose()
    Write-Output "$Name.png / $Name.svg"
}

if($Project -eq 'Client') {
    New-Diagram '클라이언트 데이터 선택과 누적 방 로딩' 'Join의 입력은 소스를 선택합니다. 검증·타입 주입·Ingame 로더는 두 모드가 공유합니다.' 1060
    Add-Box 60 170 690 120 '서버 입장 / HTTP + JSON' "join → CSV 다운로드 → 최초 상태 조회`nISessionContentService / 서버가 데이터·판정 소유" '#e9f5ef'
    Add-Box 850 170 690 120 '클라이언트 테스트 A / B' "빌드에 포함된 CSV TextAsset 읽기`nGameContentAssets / 서버 접속 없이 역할 선택" '#fff4df'
    Add-Arrow -Points @(@(405,290),@(405,325),@(800,325),@(800,355))
    Add-Arrow -Points @(@(1195,290),@(1195,325),@(800,325))
    Add-Box 470 355 660 110 'CsvParser → CsvDataSet' "한 번 읽은 문자열 원본 · 불변 스냅샷`n문법·UTF-8 오류와 원본 위치 보존"
    Add-Arrow -Points @(@(800,465),@(800,490),@(290,490),@(290,520))
    Add-Box 60 520 460 130 'CsvValidator' "컬럼·자료형·ID·테이블 참조 검사`n공통 규칙 + 게임 관계 규칙"
    Add-Box 570 520 460 130 'CsvDataStore' "정상 원본만 등록 · 변환 캐시`n검증 실패 시 기존 등록 보존"
    Add-Box 1080 520 460 130 'CsvGameData' "23개 읽기 전용 데이터 클래스`n소비자에 같은 데이터 묶음 주입"
    Add-Arrow -Points @(@(520,585),@(570,585))
    Add-Arrow -Points @(@(1030,585),@(1080,585))
    Add-Arrow -Points @(@(1310,650),@(1310,705),@(290,705),@(290,755))
    Add-Box 60 755 460 135 'GameFlowBootstrapper' "데이터·역할·세션 수명 유지`nDontDestroyOnLoad → Ingame"
    Add-Box 570 755 460 135 'IngameWorldDriver' "ROOM / PlayerType / Active 선택`n해금 ID → RoomLoadPlan"
    Add-Box 1080 755 460 135 'RoomSceneView' "AnchorID → 프리팹 스폰·데이터 주입`n기존 Surface 구조는 재사용"
    Add-Arrow -Points @(@(520,820),@(570,820))
    Add-Arrow -Points @(@(1030,820),@(1080,820))
    Add-Text 'R01: A 8행 / B 14행 연결  ·  성공한 방만 WorldReady → ready 보고' 60 925 1480 40 22 -Bold
    Add-Text '이후 RoomsChanged로 새 방만 추가합니다. 미완성 방은 대기하고 기존 방·모델은 유지합니다.' 60 979 1480 40 20
    Save-Diagram 'client-data-flow'

    New-Diagram '클라이언트 책임 분리와 이벤트 경계' 'Model·View·제어 책임을 나누고 Presenter, Facade, Adapter, Observer와 생성자 DI를 조합합니다.' 1130
    Add-Box 60 170 440 125 'SessionConnectionView' "입력 이벤트 / 상태·오류 표시`nHTTP 경로·인증 토큰을 모름"
    Add-Box 580 170 440 125 'GameEntryPresenter' "View 이벤트 → 입장 서비스`nChanged → View 렌더링"
    Add-Box 1100 170 440 125 'GameEntryService' "소스 선택·검증·클래스 주입`n씬 진입 함수·세션 계약 주입"
    Add-Arrow -Points @(@(500,232),@(580,232))
    Add-Arrow -Points @(@(1020,232),@(1100,232))
    Add-Arrow -Points @(@(1320,295),@(1320,350),@(280,350),@(280,400)) -Label '등록된 데이터와 방 구성' -LabelX 500 -LabelY 309 -LabelW 550
    Add-Box 60 400 440 125 'CsvDataSet / CsvDataStore' "불변 원본·검증·매핑 캐시`n파일·UI와 분리한 일반 C#"
    Add-Box 580 400 440 125 'CsvGameData / RoomLoadPlan' "읽기 전용 정의 / 역할·활성 선택`n로컬 테스트 진행도 별도 모델"
    Add-Box 1100 400 440 125 'IngameWorldDriver' "RoomSceneView · AnchorInstance`nUnity 생성·수명 / 누적 방 유지"
    Add-Arrow -Points @(@(500,462),@(580,462))
    Add-Arrow -Points @(@(1020,462),@(1100,462))
    Add-Arrow -Points @(@(1540,232),@(1570,232),@(1570,590),@(280,590),@(280,650)) -Label '세션 명령·콘텐츠 요청' -LabelX 500 -LabelY 548 -LabelW 550
    Add-Box 60 650 440 125 'ISession…Service 계약' "입장·조회·퇴장 / CSV·제출`n인증 정보는 내부 세션 상태에 보관"
    Add-Box 580 650 440 125 'SessionClient / Coordinator' "Facade · 요청 순서·취소·중복 제어`nStateChanged / RoomsChanged"
    Add-Box 1100 650 440 125 'HTTP Gateway / API Client' "Adapter → UnityWebRequest`nHTTP + JSON ↔ TSC_REST"
    Add-Arrow -Points @(@(500,712),@(580,712))
    Add-Arrow -Points @(@(1020,712),@(1100,712))
    Add-Arrow -Points @(@(800,775),@(800,842),@(280,842),@(280,900)) -Label '세션 StateChanged → 음성 연결 목표' -LabelX 280 -LabelY 796 -LabelW 730
    Add-Box 60 900 440 125 'SessionVoiceCoordinator' "세션 ID 기반 채널 결정`n퇴장·단절 시 연결 목표 정리"
    Add-Box 580 900 440 125 'VoiceChatService' "연결 순서·상태·정리 조정`n음성 실패와 게임 실패 분리"
    Add-Box 1100 900 440 125 'VivoxVoiceGateway' "Unity Services / Vivox SDK 경계`n실제 음성 송수신은 별도 검증"
    Add-Arrow -Points @(@(500,962),@(580,962))
    Add-Arrow -Points @(@(1020,962),@(1100,962))
    Add-Text 'GameFlowBootstrapper / SessionBootstrapper가 조립·수명을 소유하고 Driver가 Unity Update를 연결합니다.' 60 1060 1480 42 20
    Save-Diagram 'client-architecture'
}
else {
    New-Diagram '서버 시작과 HTTP 요청의 책임 분리' 'main.ts가 검증한 데이터를 주입한 뒤 HTTP 수신을 시작합니다. 요청마다 CSV 파일을 다시 읽지 않습니다.' 1100
    Add-Box 60 190 440 140 'data/ CSV 23개' "readCsvDirectory / UTF-8 입력`nCsvLoader → CsvParser"
    Add-Box 580 190 440 140 'CsvDataSet / CsvValidator' "메모리 원본·스키마·게임 관계 검사`nCsvDataStore가 정상 원본만 등록"
    Add-Box 1100 190 440 140 'CsvGameData / 전송 묶음' "읽기 전용 클래스·변환 캐시`nCSV 직렬화 + SHA-256 version"
    Add-Arrow -Points @(@(500,260),@(580,260))
    Add-Arrow -Points @(@(1020,260),@(1100,260))
    Add-Arrow -Points @(@(1320,330),@(1320,495)) -Label '생성자 DI / 같은 원본 재사용' -LabelX 890 -LabelY 390 -LabelW 400
    Add-Box 60 495 440 140 'Node HTTP / Router' "경로·메서드 → Controller`nUnity ↔ HTTP + JSON"
    Add-Box 580 495 440 140 'Controller / HTTP Handler' "토큰 헤더·본문 제한·응답 변환`nno-store / 성공·실패 HTTP 상태"
    Add-Box 1100 495 440 140 'SessionService' "참가자 인증 후 모델 조정`n세션·데이터·제출을 묶는 Facade"
    Add-Arrow -Points @(@(500,565),@(580,565))
    Add-Arrow -Points @(@(1020,565),@(1100,565))
    Add-Arrow -Points @(@(1320,635),@(1320,685),@(280,685),@(280,790))
    Add-Arrow -Points @(@(1320,685),@(800,685),@(800,790))
    Add-Arrow -Points @(@(1320,685),@(1320,790))
    Add-Box 60 790 440 145 'GameSession' "A/B 역할·참가자·ready 보유`nWaiting / Loading / Playing"
    Add-Box 580 790 440 145 'ParticipantRegistry' "토큰·HeartbeatLease 관리`nPeriodicTask → 만료·자리 정리"
    Add-Box 1100 790 440 145 'RoomProgression' "Solver·해금·슬롯 정답 비교`nsolved / unlockedRoomIds 누적"
    Add-Text '수신 전 CSV 검증 실패 → 시작 중단   |   인증·결과 변환은 HTTP 경계, 게임 규칙은 모델의 책임입니다.' 60 975 1480 42 21 -Bold
    Add-Text '한 프로세스·한 메모리 세션  ·  영구 저장·다중 세션·Protobuf 실통신·음성 중계는 현재 범위 밖입니다.' 60 1031 1480 40 20
    Save-Diagram 'server-architecture'

    New-Diagram '두 클라이언트의 동기화와 공간 해금' 'R01 기준 A는 단서, B는 해결자입니다. 판정과 누적 해금은 서버가 소유합니다.' 1320
    Add-Box 60 160 390 95 '클라이언트 A' 'R01 Clue / Unity' '#eef5fa'
    Add-Box 605 160 390 95 'TSC_REST 서버' 'CSV · 세션 · 정답 · 해금' '#e9f5ef'
    Add-Box 1150 160 390 95 '클라이언트 B' 'R01 Solver / Unity' '#eef5fa'
    Add-LifeLine 255 255 1155
    Add-LifeLine 800 255 1155
    Add-LifeLine 1345 255 1155
    Add-Arrow -Points @(@(255,315),@(800,315)) -Label '① join → data → 최초 query' -LabelX 260 -LabelY 273 -LabelW 535
    Add-Arrow -Points @(@(800,380),@(255,380)) -Label '② CSV 23개 + 초기 해금 상태' -LabelX 260 -LabelY 338 -LabelW 535
    Add-Arrow -Points @(@(1345,450),@(800,450)) -Label '③ join → data → 최초 query' -LabelX 805 -LabelY 408 -LabelW 535
    Add-Arrow -Points @(@(800,515),@(1345,515)) -Label '④ CSV 23개 + 초기 해금 상태' -LabelX 805 -LabelY 473 -LabelW 535
    Add-Arrow -Points @(@(255,585),@(800,585)) -Label '⑤ 검증·주입·R01 로드 후 ready' -LabelX 260 -LabelY 543 -LabelW 535
    Add-Arrow -Points @(@(1345,650),@(800,650)) -Label '⑥ 검증·주입·R01 로드 후 ready' -LabelX 805 -LabelY 608 -LabelW 535
    Add-Text '양쪽 ready → Playing' 590 680 420 42 22 -Bold -Center
    Add-Arrow -Points @(@(1345,780),@(800,780)) -Label '⑦ submit { answers: [...] }' -LabelX 805 -LabelY 738 -LabelW 535
    Add-Text 'Solver·활성·해금·Slot 정답 비교' 570 802 460 40 20 -Center
    Add-Arrow -Points @(@(800,900),@(1345,900)) -Label '⑧ 판정 + 누적 unlockedRoomIds' -LabelX 805 -LabelY 858 -LabelW 535
    Add-Arrow -Points @(@(255,980),@(800,980)) -Label '⑨ 주기적 세션 상태 조회' -LabelX 260 -LabelY 938 -LabelW 535
    Add-Arrow -Points @(@(800,1050),@(255,1050)) -Label '⑩ 상대도 누적 해금 상태 수신' -LabelX 260 -LabelY 1008 -LabelW 535
    Add-Box 60 1145 670 110 'R01 유지 + 새 방만 추가 로드' "RoomsChanged → 역할별 ROOM → AnchorID`n현재 없는 R02 콘텐츠는 로드 대기"
    Add-Box 870 1145 670 110 'R01 유지 + 새 방만 추가 로드' "중복 스냅샷으로 모델을 다시 만들지 않음`n이전 공간으로 돌아갈 수 있는 구조 유지"
    Save-Diagram 'server-sync-sequence'
}
