"""
LottoBank — GitHub Actions lotto cache updater
매주 토요일 추첨 직후 자동 실행, dhlottery에서 당첨번호 가져와 lotto-cache.json 저장
"""

import json
import urllib.request
import os
from datetime import datetime, timezone

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/lt645/result',
    'X-Requested-With': 'XMLHttpRequest',
}

CACHE_PATH = 'lotto-cache.json'
SEED_ROUND = 1228  # 캐시 없을 때 시작 회차


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode('utf-8'))


def fmt_date(ymd):
    if ymd and len(ymd) == 8:
        return f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}"
    return ymd or ''


def build_result(item):
    return {
        'returnValue': 'success',
        'drwNo': int(item['ltEpsd']),
        'drwNoDate': fmt_date(item.get('ltRflYmd', '')),
        'drwtNo1': int(item.get('tm1WnNo', 0)),
        'drwtNo2': int(item.get('tm2WnNo', 0)),
        'drwtNo3': int(item.get('tm3WnNo', 0)),
        'drwtNo4': int(item.get('tm4WnNo', 0)),
        'drwtNo5': int(item.get('tm5WnNo', 0)),
        'drwtNo6': int(item.get('tm6WnNo', 0)),
        'bnusNo': int(item.get('bnsWnNo', 0)),
        'firstWinamnt': int(item.get('rnk1WnAmt', 0) or 0),
        'firstPrzwnerCo': int(item.get('rnk1WnNope', 0) or 0),
    }


def try_new_api(round_num):
    """새 API (2026) — center/right 두 방향 시도"""
    for direction in ['center', 'right']:
        ep = round_num if direction == 'center' else round_num + 5
        try:
            url = f"https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir={direction}&srchLtEpsd={ep}"
            data = fetch_json(url)
            # API 응답 구조: data.list 또는 list
            items = (data.get('data') or {}).get('list') or data.get('list') or []
            for item in items:
                if int(item.get('ltEpsd', 0)) == round_num:
                    print(f"  ✅ 새 API ({direction}) 성공: {round_num}회")
                    return build_result(item)
        except Exception as e:
            print(f"  새 API ({direction}) 실패: {e}")
    return None


def try_old_api(round_num):
    """구 API (common.do) — 폴백용"""
    try:
        url = f"https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={round_num}"
        data = fetch_json(url)
        if data.get('returnValue') == 'success':
            print(f"  ✅ 구 API 성공: {round_num}회")
            return {
                'returnValue': 'success',
                'drwNo': data['drwNo'],
                'drwNoDate': data.get('drwNoDate', ''),
                'drwtNo1': data['drwtNo1'], 'drwtNo2': data['drwtNo2'],
                'drwtNo3': data['drwtNo3'], 'drwtNo4': data['drwtNo4'],
                'drwtNo5': data['drwtNo5'], 'drwtNo6': data['drwtNo6'],
                'bnusNo': data['bnusNo'],
                'firstWinamnt': data.get('firstWinamnt', 0),
                'firstPrzwnerCo': data.get('firstPrzwnerCo', 0),
            }
    except Exception as e:
        print(f"  구 API 실패: {e}")
    return None


def main():
    # 현재 캐시 읽기
    current_round = 0
    try:
        with open(CACHE_PATH, encoding='utf-8') as f:
            current = json.load(f)
            current_round = int(current.get('drwNo', 0))
        print(f"현재 캐시: {current_round}회")
    except Exception:
        print(f"캐시 없음 — 시드 회차 {SEED_ROUND} 사용")
        current_round = SEED_ROUND - 1  # 다음 회차 = SEED_ROUND

    # 다음 회차 먼저 시도 → 실패 시 현재 회차 갱신
    for round_num in [current_round + 1, current_round]:
        if round_num <= 0:
            continue
        print(f"시도: {round_num}회...")
        result = try_new_api(round_num) or try_old_api(round_num)
        if result and result.get('drwtNo1'):  # 번호가 실제로 있어야 저장
            result['_cachedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            with open(CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"💾 저장 완료: {result['drwNo']}회 ({result['drwNoDate']})")
            print(f"   번호: {result['drwtNo1']} {result['drwtNo2']} {result['drwtNo3']} "
                  f"{result['drwtNo4']} {result['drwtNo5']} {result['drwtNo6']} +{result['bnusNo']}")
            return

    print("새 데이터 없음 — 기존 캐시 유지")


if __name__ == '__main__':
    main()
