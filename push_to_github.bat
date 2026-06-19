@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git commit -m "feat: mobile nav fortune tab + scroll-to-top + quick nav + rank bars + heatmap + goal tracker + DNA share + community mine tab + QR guide"
git push origin main
pause
