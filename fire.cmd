@echo off
rem fire: publish now. GitHub, then the site on Vercel, then the Oracle tower,
rem without waiting for the tower's night. It shows what goes live and asks you
rem to type FIRE before anything leaves the laptop. docs/ATELIER.md
rem   fire.cmd --dry-run    what it would do, nothing sent
rem   fire.cmd --no-tower   GitHub and Vercel only
cd /d "%~dp0"
node scripts\fire.mjs %*
echo.
pause
