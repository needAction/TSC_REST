param(
    [Parameter(Mandatory = $true)]
    [string] $UnityEditorPath
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$unityData = Join-Path $UnityEditorPath 'Data'
$protocolSources = Get-ChildItem (Join-Path $projectRoot 'protocol\generated\csharp') -Filter '*.cs' | ForEach-Object { $_.FullName }
$arguments = @(
    '/nologo', '/noconfig', '/nostdlib', '/langversion:9', '/target:library',
    ('/out:' + (Join-Path $projectRoot '.protocol-tools\UnityProtocolCompileCheck.dll')),
    ('/reference:' + (Join-Path $projectRoot '.protocol-tools\nuget\google.protobuf\3.33.0\lib\netstandard2.0\Google.Protobuf.dll')),
    ('/reference:' + (Join-Path $unityData 'NetStandard\ref\2.1.0\netstandard.dll')),
    ('/reference:' + (Join-Path $unityData 'NetStandard\compat\2.1.0\shims\netstandard\System.Memory.dll'))
)
& (Join-Path $unityData 'NetCoreRuntime\dotnet.exe') (Join-Path $unityData 'DotNetSdkRoslyn\csc.dll') @arguments @protocolSources
if ($LASTEXITCODE -ne 0) { throw 'Unity 참조 환경에서 Protobuf 생성 코드 컴파일 실패' }
Write-Output 'Unity .NET Standard 2.1 참조 환경의 생성 코드 컴파일 통과'
