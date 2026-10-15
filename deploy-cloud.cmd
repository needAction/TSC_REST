@echo off
node "%~dp0scripts\deploy-docker.cjs" cloud %*
set "serverExitCode=%errorlevel%"
pause
exit /b %serverExitCode%
