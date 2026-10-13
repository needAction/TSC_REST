@echo off
node "%~dp0scripts\run.cjs" local
set "serverExitCode=%errorlevel%"
pause
exit /b %serverExitCode%
