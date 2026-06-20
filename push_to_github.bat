@echo off
cd /d "C:\Users\최우석\Desktop\LottoBank"
echo === GitHub Push Start ===
git add -A
git status
git commit -m "sync" --allow-empty
git push origin main
echo === Done ===
pause
