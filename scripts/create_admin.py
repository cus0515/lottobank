"""
일회성 관리자 계정 생성 스크립트.
useok.choi@admin.com 계정을 생성(이미 있으면 스킵)하고 app_admins에 등록한다.
실행: GitHub Actions workflow_dispatch로 1회 수동 실행 (create-admin.yml)
"""
import json
import os
import random
import sys
import urllib.error
import urllib.request

SUPABASE_URL = 'https://wosbpljbdyofavsbrkyn.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
ADMIN_EMAIL = 'useok.choi@admin.com'


def call(method, path, body=None, base='/rest/v1'):
    url = f'{SUPABASE_URL}{base}{path}'
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode('utf-8')
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def main():
    if not SERVICE_KEY:
        print('SUPABASE_SERVICE_ROLE_KEY 없음', file=sys.stderr)
        sys.exit(1)

    status, res = call('GET', '/admin/users?per_page=200', base='/auth/v1')
    existing = None
    if status < 400 and isinstance(res, dict):
        for u in res.get('users', []):
            if (u.get('email') or '').lower() == ADMIN_EMAIL.lower():
                existing = u
                break

    if existing:
        uid = existing['id']
        print(f'[ok] 기존 계정 사용 id={uid} (비밀번호는 변경 없음)')
    else:
        password = f'Ltb-{random.randint(10**9, 10**10-1)}!'
        status, res = call('POST', '/admin/users', {
            'email': ADMIN_EMAIL,
            'email_confirm': True,
            'password': password,
            'user_metadata': {'nickname': '운영자'},
        }, base='/auth/v1')
        if status >= 400:
            print(f'[error] 계정 생성 실패: {status} {res}', file=sys.stderr)
            sys.exit(1)
        uid = res['id']
        print(f'[ok] 신규 계정 생성 id={uid}')
        print(f'[password] {password}')

    status, res = call('POST', '/rpc/bootstrap_app_admin', {'target_email': ADMIN_EMAIL})
    if status >= 400:
        print(f'[error] bootstrap_app_admin 실패: {status} {res}', file=sys.stderr)
        sys.exit(1)
    print(f'[ok] app_admins 등록 완료: {res}')


if __name__ == '__main__':
    main()
