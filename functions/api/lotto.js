/**
 * Cloudflare Pages Function: /api/lotto?round=1226
 *
 * 우선순위:
 *   1) GitHub Actions 캐시 (raw.githubusercontent.com) — 가장 빠름, IP 차단 없음
 *   2) 새 dhlottery API (2026) — center/right 두 방향
 *   3) 구 dhlottery API (common.do) — 최후 폴백
 */

const GITHUB_CACHE_URL =
  'https://raw.githubusercontent.com/cus0515/lottobank/main/lotto-cache.json';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round parameter required' }), {
      status: 400,
      headers: cors,
    });
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    Referer: 'https://www.dhlottery.co.kr/lt645/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function fetchWithTimeout(fetchUrl, opts = {}, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(fetchUrl, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  function buildResult(item, source) {
    return {
      returnValue: 'success',
      _source: source,
      drwNo: Number(item.ltEpsd ?? item.drwNo),
      drwNoDate: item.drwNoDate ?? formatDate(item.ltRflYmd),
      drwtNo1: Number(item.tm1WnNo ?? item.drwtNo1),
      drwtNo2: Number(item.tm2WnNo ?? item.drwtNo2),
      drwtNo3: Number(item.tm3WnNo ?? item.drwtNo3),
      drwtNo4: Number(item.tm4WnNo ?? item.drwtNo4),
      drwtNo5: Number(item.tm5WnNo ?? item.drwtNo5),
      drwtNo6: Number(item.tm6WnNo ?? item.drwtNo6),
      bnusNo: Number(item.bnsWnNo ?? item.bnusNo),
      firstWinamnt: Number(item.rnk1WnAmt ?? item.firstWinamnt ?? 0),
      firstPrzwnerCo: Number(item.rnk1WnNope ?? item.firstPrzwnerCo ?? 0),
      totSellamnt: Number(item.totSellamnt ?? 0),
    };
  }

  // ── Method 0: GitHub Actions 캐시 (가장 빠름) ─────────────────────────────
  try {
    const res = await fetchWithTimeout(GITHUB_CACHE_URL, {}, 4000);
    if (res.ok) {
      const cached = await res.json();
      if (
        cached?.returnValue === 'success' &&
        Number(cached.drwNo) === round
      ) {
        cached._source = 'github-cache';
        return new Response(JSON.stringify(cached), { headers: cors });
      }
    }
  } catch (_) {}

  // ── Method 1: 새 API center (2026) ───────────────────────────────────────
  try {
    const apiUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=${round}&_=${Date.now()}`;
    const res = await fetchWithTimeout(apiUrl, { headers: browserHeaders }, 6000);
    if (res.ok) {
      const json = await res.json();
      const list = json?.data?.list ?? json?.list;
      if (Array.isArray(list) && list.length > 0) {
        const item = list.find((x) => Number(x.ltEpsd) === round) ?? list[0];
        return new Response(
          JSON.stringify(buildResult(item, 'new-api-center')),
          { headers: cors }
        );
      }
    }
  } catch (_) {}

  // ── Method 2: 새 API right ───────────────────────────────────────────────
  try {
    const apiUrl2 = `https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=right&srchLtEpsd=${round + 5}&_=${Date.now()}`;
    const res = await fetchWithTimeout(apiUrl2, { headers: browserHeaders }, 6000);
    if (res.ok) {
      const json = await res.json();
      const list = json?.data?.list ?? json?.list;
      if (Array.isArray(list) && list.length > 0) {
        const item = list.find((x) => Number(x.ltEpsd) === round);
        if (item) {
          return new Response(
            JSON.stringify(buildResult(item, 'new-api-right')),
            { headers: cors }
          );
        }
      }
    }
  } catch (_) {}

  // ── Method 3: 구 API (common.do) ─────────────────────────────────────────
  try {
    const oldUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
    const res = await fetchWithTimeout(
      oldUrl,
      {
        headers: {
          ...browserHeaders,
          Accept: 'application/json, */*',
          Referer: 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
        },
      },
      6000
    );
    if (res.ok) {
      const text = await res.text();
      if (text.trim().startsWith('{')) {
        const data = JSON.parse(text);
        if (data?.returnValue === 'success') {
          data._source = 'old-api';
          return new Response(JSON.stringify(data), { headers: cors });
        }
      }
    }
  } catch (_) {}

  return new Response(
    JSON.stringify({ returnValue: 'fail', error: 'all methods failed', round }),
    { status: 500, headers: cors }
  );
}

function formatDate(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
