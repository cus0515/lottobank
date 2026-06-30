@echo off
cd /d "C:\Users\최우석\Desktop\LottoBank"
echo === GitHub Push Start ===
git add -A
git commit -m "feat: 랭킹 내 순위 배너 + CSS 보완 + UX 개선"
git push origin main
echo === Push Done ===
pause
