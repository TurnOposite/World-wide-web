@echo off
rem Radio Tower library bot: opens the checklist, files new songs and new
rem album zips as they arrive, and sends them to the tower. Close this window
rem to stop.
rem
rem Which music folder: MUSIC_DIR if it is set; else ..\music when it holds
rem the library (playlists.json); else ..\..\Radio Tower\music, where the
rem library stays on Ortis's laptop now that the code runs from the git copy
rem (docs/LIVE.md). The key is found beside that folder, in library\tower.json.
cd /d "%~dp0.."
set "LIB=%MUSIC_DIR%"
if not defined LIB if exist "%~dp0..\music\playlists.json" set "LIB=%~dp0..\music"
if not defined LIB if exist "%~dp0..\..\Radio Tower\music\playlists.json" set "LIB=%~dp0..\..\Radio Tower\music"
if not defined LIB set "LIB=%~dp0..\music"
echo   music: %LIB%
if exist "%LIB%\_checklist.html" start "" "%LIB%\_checklist.html"
node "%~dp0bot.mjs" watch --publish --albums --lib "%LIB%"
pause
