#!/bin/bash
# index.html 끝 잘림 자동 복원
python3 -c "
import subprocess, re
path = '/sessions/practical-determined-euler/mnt/LottoBank/index.html'
content = open(path, encoding='utf-8').read()

# 닫는 태그 확인
if content.rstrip().endswith('</html>'):
    print('OK - 파일 정상')
else:
    tail = subprocess.run(['git','-C','/sessions/practical-determined-euler/mnt/LottoBank','show','7a3521a:index.html'], capture_output=True).stdout
    marker = '프로필을 보려면 먼저 로그인하세요'.encode()
    idx = tail.rfind(marker)
    suffix = tail[idx + len(marker):].decode('utf-8')
    open(path, 'a', encoding='utf-8').write(suffix)
    print('FIXED - 끝 복원 완료')

# JS 문법 검사
content2 = open(path, encoding='utf-8').read()
opens = [m.start() for m in __import__('re').finditer(r'<script>', content2)]
closes_after = [m.start() for m in __import__('re').finditer(r'</script>', content2) if m.start() > opens[-1]]
js = content2[opens[-1]+8:closes_after[0]]
open('/tmp/ltb_check.js','w').write(js)
print(f'Script size: {len(js)} chars')
"
node --check /tmp/ltb_check.js && echo "✅ JS 문법 OK" || echo "❌ JS 문법 오류"
