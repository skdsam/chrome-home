@echo off
title Uninstall Spotify Helper Startup
powershell -NoProfile -ExecutionPolicy Bypass -Command "$shortcutPath = [System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup', 'ChromeHome-Spotify.lnk'); if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force; Write-Host 'Autostart shortcut removed.' } else { Write-Host 'Shortcut was not present.' }"
echo Done.
timeout /t 3 >nul
