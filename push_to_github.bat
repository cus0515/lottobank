@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git commit -m "feat: number heatmap + goal tracker + custom number analyzer + header countdown + rank bars + community mine tab + QR guide + dark mode polish"
git push origin main
pause
