"""
LottoBank — 커뮤니티 "소식" 게시판 자동 작성
매주 로또/연금 회차 결과가 갱신된 직후(update-lotto.yml에서 호출) 실행.
역대 데이터에서 흥미로운 사실(hook)을 뽑아 회차마다 다른 조합으로 소식 글을 만들고,
Gemini API 키가 있으면 자연스러운 문장으로 다듬은 뒤, 없으면 템플릿 그대로 사용해
Supabase posts 테이블에 봇 계정으로 등록한다.

필요한 GitHub 저장소 시크릿:
  - SUPABASE_SERVICE_ROLE_KEY  (필수, RLS 우회용 — Supabase 대시보드 Project Settings > API)
  - GEMINI_API_KEY             (선택, 없으면 템플릿 문장 그대로 게시)

이미 이번 회차를 게시했다면 중복 게시하지 않도록 lotto-news-state.json /
pension-news-state.json 에 마지막으로 게시한 회차를 기록한다(다른 캐시 파일과
동일하게 커밋됨).
"""
import json
import html
import os
import random
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SUPABASE_URL = 'https://wosbpljbdyofavsbrkyn.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()
GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '').strip()
GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']

BOT_EMAIL = 'news-bot@lottobank.internal'
BOT_NICKNAME = '로또뱅크 소식봇'
SITE_URL = 'https://lottobank.pages.dev'
RECOMMENDATIONS_PATH = 'site-recommendations.json'


# ───────────────────────── 공용 유틸 ─────────────────────────

def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def pack_title(title, body):
    # index.html의 packCommTitle()과 반드시 동일한 포맷을 유지해야 함
    if not body:
        return title
    encoded = urllib.parse.quote(body, safe='')
    return f'{title} [[LTB_BODY:{encoded}]]'


def money(n):
    return f'{int(n):,}원'


def latest_record(lottery_type, history):
    """이력의 최신 회차에 상세 캐시를 병합해 게시 판단에 필요한 값을 채운다."""
    latest = dict(history[-1])
    cache = load_json(f'{lottery_type}-cache.json', {}) or {}
    if int(cache.get('drwNo', 0) or 0) != int(latest.get('drwNo', 0) or 0):
        return latest
    if lottery_type == 'lotto':
        latest.update({
            'drwNoDate': cache.get('drwNoDate') or latest.get('drwNoDate'),
            'numbers': [cache.get(f'drwtNo{i}') for i in range(1, 7)],
            'bonusNo': cache.get('bnusNo'),
            'firstWinamnt': cache.get('firstWinamnt', 0),
            'firstPrzwnerCo': cache.get('firstPrzwnerCo', 0),
            'totSellamnt': cache.get('totSellamnt', 0),
            'regions': cache.get('regions', []),
        })
    else:
        latest.update({
            'drwNoDate': cache.get('drwNoDate') or latest.get('drwNoDate'),
            'group': cache.get('wnBndNo') or latest.get('group'),
            'number': cache.get('wnRnkVl') or latest.get('number'),
            'bonusNumber': cache.get('bnsRnkVl') or latest.get('bonusNumber'),
            'prizes': cache.get('prizes', []),
        })
    return latest


# ───────────────────────── Supabase REST ─────────────────────────

def sb_call(method, path, body=None, extra_headers=None, base='/rest/v1'):
    url = f'{SUPABASE_URL}{base}{path}'
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


def ensure_bot_user_id():
    # 1) 기존 봇 계정이 있는지 조회 (프로젝트 유저 수가 적어 전체 목록에서 탐색해도 충분)
    status, res = sb_call('GET', '/admin/users?per_page=200', base='/auth/v1')
    if status < 400 and isinstance(res, dict):
        for u in res.get('users', []):
            if u.get('email') == BOT_EMAIL:
                return u['id']
    # 2) 없으면 새로 생성 (트리거가 profiles 행을 자동 생성)
    status, res = sb_call('POST', '/admin/users', {
        'email': BOT_EMAIL,
        'email_confirm': True,
        'password': f'ltb-bot-{random.randint(10**15, 10**16-1)}',
        'user_metadata': {'nickname': BOT_NICKNAME},
    }, base='/auth/v1')
    if status >= 400:
        raise RuntimeError(f'봇 계정 생성 실패: {status} {res}')
    return res['id']


def insert_news_post(bot_user_id, title, body):
    packed = pack_title(title, body)
    payload = {
        'user_id': bot_user_id,
        'nickname': BOT_NICKNAME,
        'tag': 'news',
        'title': packed,
        'likes': 0,
        'comment_count': 0,
    }
    status, res = sb_call('POST', '/posts', payload, extra_headers={'Prefer': 'return=minimal'})
    if status >= 400 and 'comment_count' in json.dumps(res or ''):
        payload.pop('comment_count', None)
        status, res = sb_call('POST', '/posts', payload, extra_headers={'Prefer': 'return=minimal'})
    if status >= 400:
        raise RuntimeError(f'게시글 등록 실패: {status} {res}')


# ───────────────────────── 로또 6/45 훅 ─────────────────────────

def lotto_hooks(history, latest):
    hooks = []
    no = latest['drwNo']

    amounts = [(r['drwNo'], r.get('firstWinamnt') or 0) for r in history if r.get('firstWinamnt')]
    if amounts and latest.get('firstWinamnt'):
        ranked = sorted(amounts, key=lambda x: -x[1])
        rank = next((i for i, (n, _) in enumerate(ranked, 1) if n == no), None)
        if rank:
            hooks.append(('jackpot_rank', {
                'rank': rank, 'total': len(ranked), 'amt': latest['firstWinamnt'],
            }))

    winners = latest.get('firstPrzwnerCo')
    if winners is not None:
        hooks.append(('winner_count', {'winners': winners, 'amt': latest.get('firstWinamnt') or 0}))

    if latest.get('totSellamnt'):
        hooks.append(('sales', {'amt': latest['totSellamnt']}))

    last_seen = {}
    for r in history:
        for n in (r.get('numbers') or []) + [r.get('bonusNo')]:
            if n:
                last_seen[n] = r['drwNo']
    if last_seen:
        gaps = [(no - seen, n) for n, seen in last_seen.items()]
        gaps.sort(reverse=True)
        gap, n = gaps[0]
        if gap >= 8:
            hooks.append(('overdue', {'num': n, 'gap': gap}))

    nums = sorted(latest.get('numbers') or [])
    consec_pairs = [(nums[i - 1], nums[i]) for i in range(1, len(nums)) if nums[i] - nums[i - 1] == 1]
    if consec_pairs:
        pair_str = ', '.join(f'{a}-{b}' for a, b in consec_pairs)
        hooks.append(('consecutive', {'count': len(consec_pairs), 'pairs': pair_str}))

    if nums:
        odd = sum(1 for n in nums if n % 2)
        if odd in (0, 1, 5, 6):
            hooks.append(('oddeven', {'odd': odd, 'even': 6 - odd}))
        hooks.append(('number_sum', {'sum': sum(nums)}))
        zones = [sum(1 for n in nums if lo <= n <= hi) for lo, hi in ((1, 10), (11, 20), (21, 30), (31, 40), (41, 45))]
        hooks.append(('zones', {'zones': '-'.join(map(str, zones))}))
        endings = {}
        for n in nums:
            endings[n % 10] = endings.get(n % 10, 0) + 1
        repeated = sorted(k for k, count in endings.items() if count >= 2)
        if repeated:
            hooks.append(('same_end', {'digits': ', '.join(map(str, repeated))}))

    previous = next((r for r in reversed(history[:-1]) if r.get('numbers')), None)
    if previous and nums:
        overlap = sorted(set(nums) & set(previous.get('numbers') or []))
        if overlap:
            hooks.append(('previous_overlap', {'count': len(overlap), 'numbers': ', '.join(map(str, overlap))}))

    regions = latest.get('regions') or []
    if regions:
        hooks.append(('regions', {'regions': ', '.join(regions[:5]), 'count': len(regions)}))

    if no % 100 == 0 or no % 50 == 0:
        hooks.append(('milestone', {'round': no}))

    return hooks


LOTTO_TEXT = {
    'jackpot_rank': [
        lambda d: f"이번 회차 1등 당첨금은 1인당 {money(d['amt'])} — 역대 {d['total']}회차 중 {d['rank']}위에 해당하는 금액이에요.",
        lambda d: f"1등 {money(d['amt'])}, 역대 로또 6/45 통틀어 {d['rank']}번째로 높은 회차 당첨금이었습니다.",
    ],
    'winner_count': [
        lambda d: (f"이번 1등은 단독 당첨! {money(d['amt'])}를 혼자 가져갔어요." if d['winners'] == 1
                    else f"이번 1등은 {d['winners']}명이 나와서 {money(d['amt'])}씩 나눠 받았습니다."),
        lambda d: (f"1등 당첨자 단 1명, {money(d['amt'])} 전액을 독차지했네요." if d['winners'] == 1
                    else f"1등 {d['winners']}명 공동 당첨 — 각각 {money(d['amt'])}씩."),
    ],
    'sales': [
        lambda d: f"이번 회차 공식 총 판매액은 {money(d['amt'])}입니다.",
        lambda d: f"공식 집계 기준 총 판매액은 {money(d['amt'])}입니다.",
    ],
    'overdue': [
        lambda d: f"{d['num']}번은 최근 {d['gap']}회 동안 당첨·보너스 번호에 포함되지 않았습니다. 이는 과거 기록이며 다음 회차를 예측하지는 않습니다.",
        lambda d: f"최장 미출현 번호는 {d['num']}번 — {d['gap']}회 동안 잠잠했습니다.",
    ],
    'consecutive': [
        lambda d: f"이번 회차엔 연속번호가 {d['count']}쌍 나왔어요 ({d['pairs']}).",
        lambda d: f"눈에 띄는 연속번호 포함 — {d['pairs']}.",
    ],
    'oddeven': [
        lambda d: (f"홀짝 비율은 {d['odd']}:{d['even']}, " + ("홀수 쪽으로 쏠린 회차였어요." if d['odd']>=5 else "짝수 쪽으로 쏠린 회차였어요." if d['even']>=5 else "균형 잡힌 조합이었어요.")),
    ],
    'milestone': [
        lambda d: f"제 {d['round']}회 — 로또 6/45가 어느덧 이 숫자까지 왔네요.",
    ],
    'number_sum': [
        lambda d: f"여섯 당첨번호의 합은 {d['sum']}입니다.",
    ],
    'zones': [
        lambda d: f"번호대 분포는 1~10부터 41~45까지 순서대로 {d['zones']}개입니다.",
    ],
    'same_end': [
        lambda d: f"같은 끝수가 두 번 이상 나온 숫자는 {d['digits']}입니다.",
    ],
    'previous_overlap': [
        lambda d: f"직전 회차와 겹친 번호는 {d['numbers']}로 모두 {d['count']}개입니다.",
    ],
    'regions': [
        lambda d: f"공개된 주요 당첨 지역은 {d['regions']}이며, 전체 지역 정보는 회차 조회에서 확인할 수 있습니다.",
    ],
}


def build_lotto_post(latest, history):
    no = latest['drwNo']
    nums = sorted(latest.get('numbers') or [])
    bonus = latest.get('bonusNo')
    hooks = lotto_hooks(history, latest)
    rnd = random.Random(no)  # 회차 고정 시드 → 같은 회차는 항상 같은 조합
    rnd.shuffle(hooks)
    picked = hooks[:min(3, len(hooks))]
    lines = []
    for key, data in picked:
        variants = LOTTO_TEXT.get(key)
        if not variants:
            continue
        lines.append(rnd.choice(variants)(data))

    title = f"제 {no}회 로또 6/45 결과, {'이번 주는 이랬어요' if not picked else '이번 주 관전 포인트'}"
    if picked and picked[0][0] in ('jackpot_rank', 'milestone'):
        title = f"제 {no}회 로또 6/45 — " + re.sub(r'[.!]$', '', LOTTO_TEXT[picked[0][0]][0](picked[0][1]))[:40]

    body_lines = [f"당첨번호: {' · '.join(str(n) for n in nums)} + 보너스 {bonus}", '이번 회차 공식 결과와 역대 데이터를 함께 살펴봤습니다.', '']
    body_lines += [f"• {l}" for l in lines]
    body_lines += ['', '내 번호 QR 인증하고 전적 확인은 QR 인증 탭에서!']
    body = '\n'.join(body_lines)
    return title, body


# ───────────────────────── 연금복권 720+ 훅 ─────────────────────────

def pension_hooks(history, latest):
    hooks = []
    no = latest['drwNo']

    group_counts = {}
    for r in history:
        g = r.get('group')
        if g:
            group_counts[g] = group_counts.get(g, 0) + 1
    if group_counts:
        top_group = max(group_counts, key=group_counts.get)
        hooks.append(('top_group', {'group': top_group, 'count': group_counts[top_group], 'total': len(history)}))

    this_group = latest.get('group')
    if this_group:
        recent = [r for r in history if r.get('group') == this_group]
        hooks.append(('group_freq', {'group': this_group, 'count': len(recent), 'total': len(history)}))

    if no % 50 == 0 or no % 100 == 0:
        hooks.append(('milestone', {'round': no}))

    num = latest.get('number', '')
    if len(num) == 6:
        digit_sum = sum(int(c) for c in num)
        hooks.append(('digitsum', {'sum': digit_sum}))
        odd = sum(1 for c in num if int(c) % 2)
        hooks.append(('oddeven', {'odd': odd, 'even': 6 - odd}))
        repeats = len(num) - len(set(num))
        if repeats >= 2:
            hooks.append(('repeat', {'count': repeats}))

    previous = next((r for r in reversed(history[:-1]) if r.get('number')), None)
    if previous and len(num) == 6:
        same_positions = [str(i + 1) for i, (a, b) in enumerate(zip(num, str(previous.get('number')))) if a == b]
        if same_positions:
            hooks.append(('previous_positions', {'positions': ', '.join(same_positions), 'count': len(same_positions)}))

    return hooks


PENSION_TEXT = {
    'top_group': [
        lambda d: f"역대 연금복권 720+에서 가장 많이 나온 조는 {d['group']}조예요 ({d['total']}회 중 {d['count']}회).",
    ],
    'group_freq': [
        lambda d: f"이번에 나온 {d['group']}조는 지금까지 {d['total']}회 중 {d['count']}번째 등장이에요.",
    ],
    'milestone': [
        lambda d: f"제 {d['round']}회 — 연금복권 720+ 회차도 이만큼 쌓였네요.",
    ],
    'digitsum': [
        lambda d: f"당첨번호 여섯 자리 합은 {d['sum']}이었어요.",
    ],
    'repeat': [
        lambda d: f"이번 당첨번호엔 같은 숫자가 {d['count']}개 겹쳐 있었어요.",
    ],
    'oddeven': [
        lambda d: f"여섯 자리의 홀짝 구성은 홀수 {d['odd']}개, 짝수 {d['even']}개입니다.",
    ],
    'previous_positions': [
        lambda d: f"직전 회차와 같은 숫자가 놓인 자리는 {d['positions']}번째로 모두 {d['count']}곳입니다.",
    ],
}


def build_pension_post(latest, history):
    no = latest['drwNo']
    group = latest.get('group')
    num = latest.get('number')
    hooks = pension_hooks(history, latest)
    rnd = random.Random(no * 7 + 3)
    rnd.shuffle(hooks)
    picked = hooks[:min(3, len(hooks))]
    lines = [rnd.choice(PENSION_TEXT[key])(data) for key, data in picked if key in PENSION_TEXT]

    title = f"제 {no}회 연금복권 720+ 결과 나왔어요"
    bonus = latest.get('bonusNumber')
    body_lines = [f"당첨번호: {group}조 {num}" + (f" · 보너스 {bonus}" if bonus else ''), '이번 회차 공식 결과와 역대 데이터를 함께 살펴봤습니다.', '']
    body_lines += [f"• {l}" for l in lines]
    body_lines += ['', '내 번호 QR 인증하고 전적 확인은 QR 인증 탭에서!']
    body = '\n'.join(body_lines)
    return title, body


# ───────────────────────── Gemini 다듬기 (선택) ─────────────────────────

def _build_prompt(title, body, lottery_label):
    return (
        f"너는 복권 정보 커뮤니티 '로또뱅크'의 소식 게시판 작성자야. 아래 사실들만 근거로 "
        f"{lottery_label} 이번 회차 소식 게시글을 다듬어줘.\n\n"
        f"[제목 초안]\n{title}\n\n[본문 초안]\n{body}\n\n"
        "규칙: 사실을 과장하거나 새로운 사실을 지어내지 말 것. 도박을 부추기거나 구매를 권유하는 "
        "표현은 쓰지 말 것. 정중체(합니다체)로, 친근하고 읽기 쉬운 정보형 문장으로 작성할 것. "
        "당첨번호 요약, 데이터 관전 포인트, 서비스 확인 경로 순서를 유지할 것. 본문은 5~8줄, "
        "이모지는 최대 1개만. 아래 JSON 형식으로만 답해:\n"
        '{"title": "...", "body": "..."}'
    )


def _parse_ai_json(text):
    match = re.search(r'\{.*\}', text, re.S)
    if not match:
        return None
    parsed = json.loads(match.group(0))
    new_title = (parsed.get('title') or '').strip()
    new_body = (parsed.get('body') or '').strip()
    if new_title and new_body:
        return new_title, new_body
    return None


def polish_with_gemini(title, body, lottery_label):
    if not GEMINI_KEY:
        return None
    prompt = _build_prompt(title, body, lottery_label)
    for model in GEMINI_MODELS:
        try:
            url = (f'https://generativelanguage.googleapis.com/v1beta/models/'
                   f'{model}:generateContent')
            payload = {
                'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {
                    'temperature': 0.9,
                    'maxOutputTokens': 600,
                    'responseMimeType': 'application/json',
                },
            }
            req = urllib.request.Request(
                url, data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_KEY,
                }, method='POST')
            with urllib.request.urlopen(req, timeout=20) as r:
                res = json.loads(r.read().decode('utf-8'))
            text = res['candidates'][0]['content']['parts'][0]['text']
            result = _parse_ai_json(text)
            if result:
                return result
        except Exception as e:
            print(f'[gemini:{model}] 실패, 다음 모델/템플릿으로 폴백: {e}', file=sys.stderr)
            continue
    return None


def polish_text(title, body, lottery_label):
    result = polish_with_gemini(title, body, lottery_label)
    if result:
        return result
    return title, body


# ───────────────────────── 검색 노출용 정적 문서 ─────────────────────────

def news_slug(lottery_type, round_no):
    return f'{lottery_type}-{round_no}'


def render_news_html(lottery_type, latest, title, body):
    round_no = latest['drwNo']
    slug = news_slug(lottery_type, round_no)
    url = f'{SITE_URL}/news/{slug}'
    label = '로또 6/45' if lottery_type == 'lotto' else '연금복권 720+'
    published = datetime.now(timezone.utc).date().isoformat()
    content_lines = [re.sub(r'\s+', ' ', line).strip(' •') for line in body.splitlines() if line.strip()]
    description = ' '.join(content_lines[:2])[:160]
    paragraphs = ''.join(
        f'<p>{html.escape(line.lstrip("• "))}</p>'
        for line in body.splitlines() if line.strip()
    )
    structured = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        'headline': title,
        'description': description,
        'datePublished': published,
        'dateModified': published,
        'inLanguage': 'ko-KR',
        'mainEntityOfPage': url,
        'author': {'@type': 'Organization', 'name': 'LottoBank'},
        'publisher': {'@type': 'Organization', 'name': 'LottoBank', 'url': SITE_URL},
    }
    return f'''<!-- LottoBank 회차 소식 검색 노출 페이지 -->
<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="robots" content="index, follow"><meta name="google-adsense-account" content="ca-pub-3323488098461026">
<title>{html.escape(title)} | LottoBank</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<link rel="canonical" href="{url}"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script type="application/ld+json">{json.dumps(structured, ensure_ascii=False)}</script>
<style>body{{margin:0;background:#f6f8fb;color:#0f172a;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.8;word-break:keep-all}}nav{{background:#0f172a;padding:12px 18px}}nav a{{color:#fff;font-weight:800;text-decoration:none}}main{{max-width:820px;margin:auto;padding:32px 18px}}article{{background:#fff;border:1px solid #dbe3ef;border-radius:14px;padding:28px 32px;box-shadow:0 8px 24px rgba(15,23,42,.06)}}.kind{{color:#e11d48;font-size:13px;font-weight:800}}h1{{font-size:27px;line-height:1.35;margin:8px 0 6px}}.meta{{font-size:13px;color:#64748b;margin-bottom:22px}}p{{margin:0 0 12px;color:#334155}}.notice{{margin-top:24px;padding:13px;border-radius:8px;background:#f8fafc;color:#64748b;font-size:13px}}.links{{margin-top:22px;display:flex;gap:14px;flex-wrap:wrap}}.links a{{color:#e11d48;font-weight:700;text-decoration:none}}@media(max-width:600px){{article{{padding:22px 18px}}h1{{font-size:22px}}}}</style>
</head><body><nav><a href="/">LottoBank</a></nav><main><article>
<div class="kind">{label} 회차 소식</div><h1>{html.escape(title)}</h1>
<div class="meta">제 {round_no}회 · {html.escape(str(latest.get('drwNoDate') or published))}</div>
{paragraphs}
<div class="notice">당첨 결과의 최종 확인은 동행복권 공식 홈페이지를 이용해 주세요. 과거 통계는 다음 회차 당첨을 예측하지 않습니다.</div>
<div class="links"><a href="/">LottoBank 홈</a><a href="/{lottery_type}-winning-numbers">회차 조회</a><a href="/?page=community">커뮤니티 소식</a></div>
</article></main></body></html>'''


def update_sitemaps(url):
    today = datetime.now(timezone.utc).date().isoformat()
    xml_path = 'sitemap.xml'
    xml = ''
    if os.path.exists(xml_path):
        with open(xml_path, encoding='utf-8') as f:
            xml = f.read()
    if url not in xml:
        entry = (f'  <url>\n    <loc>{url}</loc>\n    <lastmod>{today}</lastmod>\n'
                 '    <changefreq>never</changefreq>\n    <priority>0.72</priority>\n  </url>\n')
        xml = xml.replace('</urlset>', entry + '</urlset>')
        with open(xml_path, 'w', encoding='utf-8') as f:
            f.write(xml)

    txt_path = 'sitemap.txt'
    urls = []
    if os.path.exists(txt_path):
        with open(txt_path, encoding='utf-8') as f:
            urls = [line.strip() for line in f if line.strip()]
    if url not in urls:
        urls.append(url)
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(urls) + '\n')


def write_static_news(lottery_type, latest, title, body):
    slug = news_slug(lottery_type, latest['drwNo'])
    os.makedirs('news', exist_ok=True)
    path = os.path.join('news', f'{slug}.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(render_news_html(lottery_type, latest, title, body))
    update_sitemaps(f'{SITE_URL}/news/{slug}')
    print(f'[seo] {path} 생성 완료')


def static_news_exists(lottery_type, round_no):
    return os.path.exists(os.path.join('news', f'{news_slug(lottery_type, round_no)}.html'))


# ───────────────────────── 사이트 추천 기록과 시스템 피드 ─────────────────────────

def _mulberry32(seed):
    state = seed & 0xffffffff

    def rnd():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xffffffff
        value = ((state ^ (state >> 15)) * (1 | state)) & 0xffffffff
        value = ((value + (((value ^ (value >> 7)) * (61 | value)) & 0xffffffff)) ^ value) & 0xffffffff
        return ((value ^ (value >> 14)) & 0xffffffff) / 4294967296

    return rnd


def generate_lotto_recommendation(history):
    latest = history[-1]
    next_round = int(latest['drwNo']) + 1
    latest_numbers = set(map(int, latest.get('numbers') or []))
    latest_bonus = int(latest.get('bonusNo') or 0)
    recent = sorted(history, key=lambda row: int(row.get('drwNo', 0)), reverse=True)[:50]
    frequency = {number: 0 for number in range(1, 46)}
    last_seen = {number: 0 for number in range(1, 46)}
    for row in recent:
        round_no = int(row.get('drwNo', 0))
        for number in (row.get('numbers') or []) + [row.get('bonusNo')]:
            number = int(number or 0)
            if number < 1 or number > 45:
                continue
            frequency[number] += 1
            if not last_seen[number]:
                last_seen[number] = round_no
    oldest_round = min((int(row.get('drwNo', 1)) for row in history), default=1)
    for number in range(1, 46):
        if not last_seen[number]:
            last_seen[number] = oldest_round
    gaps = {number: int(latest['drwNo']) - last_seen[number] for number in range(1, 46)}
    max_gap = max(gaps.values()) or 1
    max_frequency = max(frequency.values()) or 1
    base = [
        {'n': number, 'gap': gaps[number] / max_gap, 'frq': frequency[number] / max_frequency}
        for number in range(1, 46)
        if number not in latest_numbers and number != latest_bonus
    ]
    zone_splits = [[2, 2, 2], [2, 2, 2], [3, 2, 1], [1, 2, 3], [2, 3, 1]]
    weights = [[0.6, 0.4], [0.7, 0.3], [0.5, 0.5], [0.4, 0.6], [0.65, 0.35]]
    rnd = _mulberry32((next_round * 2654435761) & 0xffffffff)
    used = {}

    def weighted_pick(items, count):
        pool = [
            {'n': item['n'], 'w': max(item['score'] * (0.3 ** used.get(item['n'], 0)), 0.001)}
            for item in items
        ]
        picked = []
        for _ in range(min(count, len(pool))):
            remaining = rnd() * sum(item['w'] for item in pool)
            index = len(pool) - 1
            for candidate_index, item in enumerate(pool):
                remaining -= item['w']
                if remaining <= 0:
                    index = candidate_index
                    break
            chosen = pool.pop(index)
            picked.append(chosen['n'])
            used[chosen['n']] = used.get(chosen['n'], 0) + 1
        return picked

    games = []
    for (gap_weight, frequency_weight), split in zip(weights, zone_splits):
        scored = sorted((
            {'n': item['n'], 'score': item['gap'] * gap_weight + item['frq'] * frequency_weight + 0.02}
            for item in base
        ), key=lambda item: item['score'], reverse=True)
        zones = [
            [item for item in scored if item['n'] <= 15],
            [item for item in scored if 16 <= item['n'] <= 30],
            [item for item in scored if item['n'] >= 31],
        ]
        selected = set()
        for zone, count in zip(zones, split):
            selected.update(weighted_pick(zone[:max(count * 3, 8)], count))
        for item in scored:
            if len(selected) >= 6:
                break
            selected.add(item['n'])
        games.append(sorted(selected))
    return next_round, games


def generate_pension_recommendation(history):
    latest = history[-1]
    next_round = int(latest['drwNo']) + 1
    seed = int(latest.get('number') or 123456)
    last_group = int(latest.get('group') or 1)
    group_order = [group for group in range(1, 6) if group != last_group] + [last_group]
    games = []
    for index in range(5):
        number = (seed * (index + 7) * next_round) % 999999
        games.append({'jo': group_order[index], 'num': str(abs(number)).zfill(6)[:6]})
    return next_round, games


def ensure_next_recommendations():
    records = load_json(RECOMMENDATIONS_PATH, {'lotto': {}, 'pension': {}}) or {'lotto': {}, 'pension': {}}
    records.setdefault('lotto', {})
    records.setdefault('pension', {})
    changed = False
    for lottery_type in ('lotto', 'pension'):
        history = load_json(f'{lottery_type}-history.json', [])
        if not history:
            continue
        if lottery_type == 'lotto':
            round_no, games = generate_lotto_recommendation(history)
        else:
            round_no, games = generate_pension_recommendation(history)
        key = str(round_no)
        if key in records[lottery_type]:
            continue
        records[lottery_type][key] = {
            'source_round': int(history[-1]['drwNo']),
            'created_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'games': games,
        }
        changed = True
    if changed:
        save_json(RECOMMENDATIONS_PATH, records)
        print(f'[recommend] {RECOMMENDATIONS_PATH} 다음 회차 추천 저장 완료')
    return records


def lotto_recommendation_result(games, latest):
    winning = set(map(int, latest.get('numbers') or []))
    bonus = int(latest.get('bonusNo') or 0)
    ranks = []
    for game in games:
        selected = set(map(int, game))
        matched = len(selected & winning)
        if matched == 6:
            ranks.append(1)
        elif matched == 5 and bonus in selected:
            ranks.append(2)
        elif matched == 5:
            ranks.append(3)
        elif matched == 4:
            ranks.append(4)
        elif matched == 3:
            ranks.append(5)
    return min(ranks) if ranks else None, len(ranks)


def pension_recommendation_result(games, latest):
    winning = str(latest.get('number') or '').zfill(6)
    bonus = str(latest.get('bonusNumber') or '').zfill(6)
    winning_group = int(latest.get('group') or 0)
    order = {'1': 1, '2': 2, 'bonus': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8}
    ranks = []
    for game in games:
        selected = str(game.get('num') or '').zfill(6)
        group = int(game.get('jo') or 0)
        rank = None
        if group == winning_group and selected == winning:
            rank = '1'
        elif selected == winning:
            rank = '2'
        elif selected == bonus:
            rank = 'bonus'
        else:
            suffix = next((label for digits, label in ((5, '3'), (4, '4'), (3, '5'), (2, '6'), (1, '7'))
                           if selected[-digits:] == winning[-digits:]), None)
            rank = suffix
        if rank:
            ranks.append(rank)
    best = min(ranks, key=lambda rank: order[rank]) if ranks else None
    return best, len(ranks)


def feed_event_exists(event_key, user_id=None, event_type=None, round_no=None, rank=None):
    event_filter = urllib.parse.quote(json.dumps({'event_key': event_key}, separators=(',', ':')))
    status, matches = sb_call('GET', f'/activity_feed?select=id&data=cs.{event_filter}&limit=1')
    if status < 400 and isinstance(matches, list) and matches:
        return True
    path = '/activity_feed?select=id,user_id,type,data&order=created_at.desc&limit=200'
    status, rows = sb_call('GET', path)
    if status >= 400 or not isinstance(rows, list):
        return False
    for row in rows:
        data = row.get('data') or {}
        if data.get('event_key') == event_key:
            return True
        if user_id and event_type and row.get('user_id') == user_id and row.get('type') == event_type:
            if int(data.get('round') or 0) == int(round_no or 0) and str(data.get('rank')) == str(rank):
                return True
    return False


def insert_service_feed(user_id, nickname, event_type, data):
    if feed_event_exists(data['event_key'], user_id, event_type, data.get('round'), data.get('rank')):
        return False
    status, result = sb_call('POST', '/activity_feed', {
        'user_id': user_id,
        'nick': nickname,
        'type': event_type,
        'data': data,
    }, extra_headers={'Prefer': 'return=minimal'})
    if status >= 400:
        raise RuntimeError(f'시스템 피드 등록 실패: {status} {result}')
    print(f'[feed] {data["event_key"]} 등록 완료')
    return True


def insert_system_feed(bot_user_id, event_type, data):
    return insert_service_feed(bot_user_id, 'LottoBank 데이터', event_type, data)


def publish_verified_wins(lottery_type, latest):
    round_no = int(latest['drwNo'])
    query = (f'/tickets?select=id,user_id,round_no,lottery_type,game_numbers,numbers,'
             f'pension_group,pension_number,prize_rank,prize_amount&round_no=eq.{round_no}'
             f'&lottery_type=eq.{lottery_type}&limit=1000')
    status, tickets = sb_call('GET', query)
    if status >= 400 or not isinstance(tickets, list) or not tickets:
        return
    profile_status, profiles = sb_call('GET', '/profiles?select=id,nickname&limit=5000')
    nicknames = {profile['id']: profile.get('nickname') or '회원' for profile in (profiles or [])} if profile_status < 400 else {}
    for ticket in tickets:
        user_id = ticket.get('user_id')
        ticket_id = ticket.get('id')
        if not user_id or not ticket_id:
            continue
        if lottery_type == 'lotto':
            games = ticket.get('game_numbers') or ([ticket.get('numbers')] if ticket.get('numbers') else [])
            best_rank, win_count = lotto_recommendation_result(games, latest)
        else:
            games = [{'jo': ticket.get('pension_group'), 'num': ticket.get('pension_number')}]
            best_rank, win_count = pension_recommendation_result(games, latest)
        if not best_rank:
            continue
        display_rank = 8 if best_rank == 'bonus' else int(best_rank)
        insert_service_feed(user_id, nicknames.get(user_id, '회원'), 'win', {
            'event_key': f'verified-win:{ticket_id}:{round_no}:{display_rank}',
            'lottery_type': lottery_type,
            'round': round_no,
            'rank': display_rank,
            'win_count': win_count,
            'verified': True,
        })


def update_system_feed():
    records = ensure_next_recommendations()
    if not SERVICE_KEY:
        print('[warn] SUPABASE_SERVICE_ROLE_KEY 없음 — 시스템 피드 등록 건너뜀', file=sys.stderr)
        return
    bot_id = ensure_bot_user_id()
    for lottery_type in ('lotto', 'pension'):
        history = load_json(f'{lottery_type}-history.json', [])
        if not history:
            continue
        latest = latest_record(lottery_type, history)
        round_no = int(latest['drwNo'])
        draw_data = {'event_key': f'draw:{lottery_type}:{round_no}', 'lottery_type': lottery_type, 'round': round_no}
        if lottery_type == 'lotto':
            draw_data.update({'numbers': latest.get('numbers') or [], 'bonus': latest.get('bonusNo')})
        else:
            draw_data.update({'group': latest.get('group'), 'number': latest.get('number'), 'bonus_number': latest.get('bonusNumber')})
        insert_system_feed(bot_id, 'draw_result', draw_data)
        publish_verified_wins(lottery_type, latest)

        recommendation = (records.get(lottery_type) or {}).get(str(round_no))
        if not recommendation:
            continue
        games = recommendation.get('games') or []
        if lottery_type == 'lotto':
            best_rank, win_count = lotto_recommendation_result(games, latest)
        else:
            best_rank, win_count = pension_recommendation_result(games, latest)
        insert_system_feed(bot_id, 'recommend_result', {
            'event_key': f'recommend:{lottery_type}:{round_no}',
            'lottery_type': lottery_type,
            'round': round_no,
            'best_rank': best_rank,
            'win_count': win_count,
            'total_games': len(games),
        })


# ───────────────────────── 메인 ─────────────────────────

def run_for(lottery_type):
    hist_path = f'{lottery_type}-history.json'
    state_path = f'{lottery_type}-news-state.json'
    history = load_json(hist_path, [])
    if not history:
        return False
    latest = latest_record(lottery_type, history)
    state = load_json(state_path, {'lastPostedRound': 0})

    if lottery_type == 'lotto':
        if not latest.get('firstWinamnt'):
            return False  # 아직 당첨금 확정 전 — 다음 실행 때 재시도
        title, body = build_lotto_post(latest, history)
        label = '로또 6/45'
    else:
        title, body = build_pension_post(latest, history)
        label = '연금복권 720+'

    if latest['drwNo'] <= state.get('lastPostedRound', 0):
        if not static_news_exists(lottery_type, latest['drwNo']):
            write_static_news(lottery_type, latest, title, body)
        return False  # 게시 완료 회차도 누락된 검색 노출 문서는 복구

    title, body = polish_text(title, body, label)

    if not SERVICE_KEY:
        print('[warn] SUPABASE_SERVICE_ROLE_KEY 없음 — 게시 건너뜀', file=sys.stderr)
        return False

    bot_id = ensure_bot_user_id()
    insert_news_post(bot_id, title, body)
    write_static_news(lottery_type, latest, title, body)
    save_json(state_path, {'lastPostedRound': latest['drwNo']})
    print(f'[ok] {lottery_type} 제 {latest["drwNo"]}회 소식 게시 완료')
    return True


if __name__ == '__main__':
    posted_any = False
    for lt in ('lotto', 'pension'):
        try:
            if run_for(lt):
                posted_any = True
        except Exception as e:
            print(f'[error] {lt} 소식 게시 실패: {e}', file=sys.stderr)
    try:
        update_system_feed()
    except Exception as e:
        print(f'[error] 시스템 피드 갱신 실패: {e}', file=sys.stderr)
    sys.exit(0)
