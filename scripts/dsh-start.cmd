@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-start.ps1"
set "DAFEIYU_DSH_EXIT=%ERRORLEVEL%"
if not "%DAFEIYU_DSH_EXIT%"=="0" pause
exit /b %DAFEIYU_DSH_EXIT%
