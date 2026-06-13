/**
 * Cloudflare Pages Function: /api/lotto?round=1226
 *
 * 새 동행복권 API (2026):
 *   GET /lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd={회차}
 *   → JSON { data: { list: [ { ltEpsd, tm1WnNo~tm6WnNo, bnsWnNo, ltRflYmd, rnk1WnAmt, ... } ] } }
 *
 * 폴백:
 *   구 API /common.do?method=getLottoNumber&drwNo={회차}
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round parameter required' }), { status: 400, headers: cors });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/lt645/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function fetchWithTimeout(fetchUrl, opts = {}, ms = 7000) {
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
      drwNo: item.ltEpsd,
      drwNoDate: formatDate(item.ltRflYmd),
      drwtNo1: item.tm1WnNo,
      drwtNo2: item.tm2WnNo,
      drwtNo3: item.tm3WnNo,
      drwtNo4: item.tm4WnNo,
      drwtNo5: item.tm5WnNo,
      drwtNo6: item.tm6WnNo,
      bnusNo: item.bnsWnNo,
      firstWinamnt: item.rnk1WnAmt || 0,
      firstPrzwnerCo: item.rnk1WnNope || 0,
      totSellamnt: item.totSellamnt || 0,
    };
  }

  // ── Method 1: 새 API center (2026) ───────────────────────────────────────
  try {
    const apiUrl = `https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=${round}&_=${Date.now()}`;
    const res = await fetchWithTimeout(apiUrl, { headers: browserHeaders }, 7000);

    if (res.ok) {
      const json = await res.json();
      const list = json?.data?.list;

      if (Array.isArray(list) && list.length > 0) {
        // 요청 회차 우선, 없으면 리스트 첫 번째(최신)
        const item = list.find(x => x.ltEpsd === round) || list[0];
        return new Response(JSON.stringify(buildResult(item, 'new-api-center')), { headers: cors });
      }
    }
  } catch (e) {}

  // ── Method 2: 새 API right (과거 회차 탐색) ──────────────────────────────
  try {
    const apiUrl2 = `https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=right&srchLtEpsd=${round + 5}&_=${Date.now()}`;
    const res = await fetchWithTimeout(apiUrl2, { headers: browserHeaders }, 7000);

    if (res.ok) {
      const json = await res.json();
      const list = json?.data?.list;

      if (Array.isArray(list) && list.length > 0) {
        const item = list.find(x => x.ltEpsd === round);
        if (item) {
          return new Response(JSON.stringify(buildResult(item, 'new-api-right')), { headers: cors });
        }
      }
    }
  } catch (e) {}

  // ── Method 3: 구 API (common.do) ─────────────────────────────────────────
  try {
    const oldUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
    const res = await fetchWithTimeout(oldUrl, {
      headers: {
        ...browserHeaders,
        'Accept': 'application/json, */*',
        'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
      },
    }, 7000);

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
  } catch (e) {}

  return new Response(
    JSON.stringify({ returnValue: 'fail', error: 'all methods failed', round }),
    { status: 500, headers: cors }
  );
}

function formatDate(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
