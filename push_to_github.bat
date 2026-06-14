@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo Aborting any rebase in progress...
git rebase --abort 2>nul

echo Force pushing to GitHub...
git push --force origin main

echo.
echo Done! https://github.com/cus0515/lottobank
pause
