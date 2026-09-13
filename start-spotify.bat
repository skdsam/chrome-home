@echo off
title Chrome Home - Spotify Helper
cd /d "%~dp0"
echo ========================================================
echo   Chrome Home - Spotify Helper Server
echo ========================================================
echo.
echo Starting local helper on http://127.0.0.1:8888 ...
echo.
node spotify-server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server exited. Press any key to close.
    pause >nul
)
