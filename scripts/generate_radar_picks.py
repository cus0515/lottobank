"""
LottoBank — 레이더 추천번호 서버 사이드 생성
매주 회차 결과가 갱신된 직후(update-lotto.yml) 실행되어, 로또/연금 각각의
"다음 회차" 추천 5게임을 회차 고정 시드로 생성하고 Supabase public.radar_picks
테이블에 저장한다.

기존 방식(index.html의 renderFortune/renderPensionRadar)은 유저가 레이더 탭을
"방문한 주"에만 localStorage에 저장했기 때문에, 방문하지 않은 주는 추천 이력에
구멍이 생겼다. 이 스크립트는 방문 여부와 무관하게 회차마다 서버가 한 번만
생성해서 저장하므로 이력이 항상 연속된다. index.html은 이 테이블을 공개 조회해
localStorage 캐시에 병합한다(hydrateServerRadarPicks).

필요한 GitHub 저장소 시크릿:
  - SUPABASE_SERVICE_ROLE_KEY (필수, RLS 우회용)

멱등성: Supabase에 (lottery_type, round_no) unique 제약이 있고, 이 스크립트는
POST에 on_conflict + Prefer: resolution=ignore-duplicates를 사용하므로 이미
생성된 회차를 다시 실행해도 안전하다(덮어쓰지 않음 — 같은 회차는 항상 같은
추천이어야 하므로 재계산해도 결과가 같지만, 굳이 매번 재계산/재저장하지 않음).
"""
import json
import os
import random
import sys
import urllib.error
import urllib.request

SUPABASE_URL = 'https://wosbpljbdyofavsbrkyn.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()

LOTTO_HISTORY_PATH = 'lotto-history.json'
PENSION_HISTORY_PATH = 'pension-history.json'


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def sb_call(method, path, body=None, extra_headers=None):
    if not SERVICE_KEY:
        print('SUPABASE_SERVICE_ROLE_KEY 없음 — 레이더 추천 저장 스킵')
        return None, None
    url = f'{SUPABASE_URL}/rest/v1{path}'
    headers = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    if extra_headers:
        headers.update(extra_headers)
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


def upsert_radar_pick(lottery_type, round_no, games):
    status, res = sb_call(
        'POST',
        '/radar_picks?on_conflict=lottery_type,round_no',
        body=[{'lottery_type': lottery_type, 'round_no': round_no, 'games': games}],
        extra_headers={'Prefer': 'resolution=ignore-duplicates,return=minimal'},
    )
    if status is None:
        return
    if status >= 300:
        print(f'  [경고] {lottery_type} {round_no}회 저장 실패 ({status}): {res}')
    else:
        print(f'  {lottery_type} {round_no}회 추천 5게임 저장 완료')


# ───────────────────────── 로또 6/45 ─────────────────────────

ZONE_SPLITS = [(2, 2, 2), (2, 2, 2), (3, 2, 1), (1, 2, 3), (2, 3, 1)]
WEIGHTS = [(0.6, 0.4), (0.7, 0.3), (0.5, 0.5), (0.4, 0.6), (0.65, 0.35)]


def generate_lotto_games(history):
    if not history:
        return None, None
    history = sorted(history, key=lambda r: r['drwNo'])
    latest = history[-1]
    latest_round = latest['drwNo']
    next_round = latest_round + 1

    recent50 = history[-50:]
    freq = [0] * 46
    last_seen_round = [0] * 46
    for rd in recent50:
        for n in list(rd['numbers']) + [rd['bonusNo']]:
            freq[n] += 1
            if not last_seen_round[n]:
                last_seen_round[n] = rd['drwNo']
    oldest_round_in_window = recent50[0]['drwNo']
    for i in range(1, 46):
        if not last_seen_round[i]:
            last_seen_round[i] = oldest_round_in_window

    def gap_from(n):
        return latest_round - last_seen_round[n]

    all_nums = list(range(1, 46))
    max_gap = max(gap_from(n) for n in all_nums) or 1
    max_freq = max(freq[1:46]) or 1

    exclude = set(latest['numbers']) | {latest['bonusNo']}
    base_scored = [
        {'n': n, 'gap': gap_from(n) / max_gap, 'frq': freq[n] / max_freq}
        for n in all_nums if n not in exclude
    ]

    rng = random.Random(next_round * 2654435761 & 0xFFFFFFFF)
    used_count = {}

    def weighted_pick(pool, cnt):
        pool = [{'n': x['n'], 'w': max(x['score'] * (0.3 ** used_count.get(x['n'], 0)), 0.001)} for x in pool]
        out = []
        for _ in range(min(cnt, len(pool))):
            total = sum(x['w'] for x in pool)
            r = rng.random() * total
            idx = len(pool) - 1
            for i, x in enumerate(pool):
                r -= x['w']
                if r <= 0:
                    idx = i
                    break
            chosen = pool.pop(idx)
            out.append(chosen['n'])
            used_count[chosen['n']] = used_count.get(chosen['n'], 0) + 1
        return out

    def gen_game(gw, fw, zone_split):
        scored = sorted(
            ({'n': x['n'], 'score': x['gap'] * gw + x['frq'] * fw + 0.02} for x in base_scored),
            key=lambda x: -x['score'],
        )
        lo = [x for x in scored if x['n'] <= 15]
        mid = [x for x in scored if 16 <= x['n'] <= 30]
        hi = [x for x in scored if x['n'] >= 31]
        picks = []
        for arr, cnt in ((lo, zone_split[0]), (mid, zone_split[1]), (hi, zone_split[2])):
            pool = arr[:max(cnt * 3, 8)]
            for n in weighted_pick(pool, cnt):
                if n not in picks:
                    picks.append(n)
        for x in scored:
            if len(picks) >= 6:
                break
            if x['n'] not in picks:
                picks.append(x['n'])
        return sorted(picks[:6])

    games = [gen_game(gw, fw, zs) for (gw, fw), zs in zip(WEIGHTS, ZONE_SPLITS)]
    return next_round, games


# ───────────────────────── 연금복권 720+ ─────────────────────────

def generate_pension_games(history):
    if not history:
        return None, None
    history = sorted(history, key=lambda r: r['drwNo'])
    latest = history[-1]
    next_drw = latest['drwNo'] + 1

    last_jo = int(latest.get('group') or 1)
    seed = int(latest.get('number') or 123456)

    def gen_num(s):
        x = (seed * (s + 7) * next_drw) % 999999
        return str(abs(x)).zfill(6)[:6]

    jo_order = [j for j in [1, 2, 3, 4, 5] if j != last_jo] + [last_jo]
    games = [{'jo': jo_order[i % len(jo_order)], 'num': gen_num(i)} for i in range(5)]
    return next_drw, games


def main():
    lotto_history = load_json(LOTTO_HISTORY_PATH, [])
    pension_history = load_json(PENSION_HISTORY_PATH, [])

    print(f'로또 히스토리 {len(lotto_history)}건, 연금 히스토리 {len(pension_history)}건')

    round_no, games = generate_lotto_games(lotto_history)
    if round_no:
        print(f'로또 {round_no}회 추천 생성: {games}')
        upsert_radar_pick('lotto', round_no, games)

    round_no, games = generate_pension_games(pension_history)
    if round_no:
        print(f'연금 {round_no}회 추천 생성: {games}')
        upsert_radar_pick('pension', round_no, games)


if __name__ == '__main__':
    main()
