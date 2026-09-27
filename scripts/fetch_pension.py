"""
LottoBank — GitHub Actions 연금복권 720+ 캐시 업데이터
매주 목요일 추첨 직후 자동 실행, dhlottery에서 당첨번호 가져와 pension-cache.json 저장
그리고 pension-history.json(전체 회차 누적 이력)에도 새 회차를 자동 추가한다.
"""

import json
import urllib.request
from datetime import datetime, timezone

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/pt720/result',
    'X-Requested-With': 'XMLHttpRequest',
}

CACHE_PATH = 'pension-cache.json'
HISTORY_PATH = 'pension-history.json'
SEED_ROUND = 320  # 캐시 없을 때 시작 회차


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read().decode('utf-8'))


def fmt_date(ymd):
    if ymd and len(str(ymd)) == 8:
        s = str(ymd)
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return ymd or ''


def fetch_round(round_num):
    """pt720 목록 API에서 해당 회차를 찾고, 상세 API로 등위별 당첨 정보를 채운다."""
    try:
        list_data = fetch_json('https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do')
        items = (list_data.get('data') or {}).get('result') or list_data.get('result') or []
        item = next((r for r in items if int(r.get('psltEpsd', 0)) == round_num), None)
        if not item:
            return None

        prizes = []
        try:
            info_data = fetch_json(
                f'https://www.dhlottery.co.kr/pt720/selectPstPt720WnInfo.do?srchPsltEpsd={round_num}'
            )
            info_items = (info_data.get('data') or {}).get('result') or info_data.get('result') or []
            prizes = [{
                'rank': p.get('wnRnk'),
                'store': p.get('wnStoreCnt'),
                'internet': p.get('wnInternetCnt'),
                'total': p.get('wnTotalCnt'),
                'totAmt': p.get('totAmt'),
            } for p in info_items]
        except Exception as e:
            print(f"  상세 정보 조회 실패: {e}")

        return {
            'returnValue': 'success',
            'drwNo': round_num,
            'drwNoDate': fmt_date(item.get('psltRflYmd', '')),
            'wnBndNo': str(item.get('wnBndNo', '')),
            'wnRnkVl': str(item.get('wnRnkVl', '')),
            'bnsRnkVl': str(item.get('bnsRnkVl', '')),
            'prizes': prizes,
        }
    except Exception as e:
        print(f"  pt720 API 실패: {e}")
        return None


def fetch_latest_round_num():
    """공식 회차 목록에서 현재 공개된 가장 최신 회차를 찾는다."""
    try:
        list_data = fetch_json('https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do')
        items = (list_data.get('data') or {}).get('result') or list_data.get('result') or []
        rounds = [int(item.get('psltEpsd', 0)) for item in items]
        return max(rounds) if rounds else 0
    except Exception as e:
        print(f"  최신 회차 조회 실패: {e}")
        return 0


def update_history(result):
    """pension-history.json의 새 회차를 추가하거나 기존 회차 상세를 보강한다."""
    drw_no = result['drwNo']
    try:
        with open(HISTORY_PATH, encoding='utf-8') as f:
            history = json.load(f)
    except Exception:
        print(f"  ⚠️ {HISTORY_PATH} 없음 — 새로 생성")
        history = []

    record = {
        'drwNo': drw_no,
        'drwNoDate': result['drwNoDate'],
        'group': result['wnBndNo'],
        'number': result['wnRnkVl'],
        'bonusNumber': result['bnsRnkVl'],
        'prizes': result.get('prizes', []),
    }
    existing = next((rec for rec in history if rec.get('drwNo') == drw_no), None)
    if existing:
        existing.update(record)
        action = '갱신'
    else:
        history.append(record)
        action = '추가'
    history.sort(key=lambda x: x['drwNo'])

    with open(HISTORY_PATH, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, separators=(',', ':'))
    print(f"  ✅ history: {drw_no}회 {action} (총 {len(history)}회차)")
    return True


def main():
    current_round = 0
    try:
        with open(CACHE_PATH, encoding='utf-8') as f:
            current = json.load(f)
            current_round = int(current.get('drwNo', 0))
        print(f"현재 캐시: {current_round}회")
    except Exception:
        print(f"캐시 없음 — 시드 회차 {SEED_ROUND} 사용")
        current_round = SEED_ROUND

    latest_round = fetch_latest_round_num()
    candidates = [latest_round, current_round + 1, current_round]
    # 오래된 캐시도 한 번에 최신 회차로 이동하고, 목록 조회 실패 시 기존 순차 방식을 사용한다.
    for round_num in dict.fromkeys(candidates):
        if round_num <= 0:
            continue
        print(f"시도: {round_num}회...")
        result = fetch_round(round_num)
        if result and result.get('wnRnkVl'):
            result['_cachedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            with open(CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"💾 저장 완료: {result['drwNo']}회 ({result['drwNoDate']})")
            print(f"   {result['wnBndNo']}조 {result['wnRnkVl']} +{result['bnsRnkVl']}")
            update_history(result)
            return

    print("새 데이터 없음 — 기존 캐시 유지")


if __name__ == '__main__':
    main()
