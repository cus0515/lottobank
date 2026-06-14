@echo off
chcp 65001 > nul
title LottoBank GitHub Push
cd /d "%~dp0"

echo ============================================
echo  LottoBank GitHub Push
echo ============================================
echo.

git add -A
git status

git diff --cached --quiet 2>nul
if errorlevel 1 (
    git commit -m "feat: latest changes"
    echo [OK] Commit done
) else (
    echo [OK] Nothing to commit
)

git push --force-with-lease origin main

echo.
echo Done! https://github.com/cus0515/lottobank
echo Cloudflare Pages rebuild: 1-2 min
echo.
pause
