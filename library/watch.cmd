@echo off
rem Radio Tower library bot: opens the checklist and files new songs as they arrive.
rem Close this window to stop.
cd /d "%~dp0.."
set "LIB=%~dp0..\music"
if exist "%LIB%\_checklist.html" start "" "%LIB%\_checklist.html"
node "%~dp0bot.mjs" watch --publish --lib "%LIB%"
pause
