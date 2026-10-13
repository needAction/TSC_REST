@echo off
node "%~dp0scripts\run.cjs" test
set "serverExitCode=%errorlevel%"
pause
exit /b %serverExitCode%
