@echo off
node "%~dp0scripts\deploy-docker.cjs" local %*
set "serverExitCode=%errorlevel%"
pause
exit /b %serverExitCode%
