@echo off
node "%~dp0scripts\proto-tool.cjs" sync %*
set "protocolExitCode=%errorlevel%"
pause
exit /b %protocolExitCode%
