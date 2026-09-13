@echo off
title Install Spotify Helper to Windows Startup
cd /d "%~dp0"
echo Setting up Chrome Home Spotify Helper for automatic Windows startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $shortcutPath = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup', 'ChromeHome-Spotify.lnk'); $s = $ws.CreateShortcut($shortcutPath); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + (Join-Path '%~dp0' 'start-spotify-silent.vbs') + '\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Chrome Home Spotify Helper'; $s.Save()"
echo.
echo ======================================================================
echo   SUCCESS: Spotify Helper will now start automatically with Windows!
echo ======================================================================
echo.
echo Starting the helper right now in the background...
wscript "%~dp0start-spotify-silent.vbs"
echo.
echo Done! Helper is now active.
timeout /t 3 >nul
