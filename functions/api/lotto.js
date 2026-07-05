/**
 * Cloudflare Pages Function: /api/lotto?round=N
 * Priority: 1) GitHub cache  2) old API  3) HTML scrape
 */

const GITHUB_CACHE_URL =
  'https://raw.githubusercontent.com/cus0515/lottobank/main/lotto-cache.json';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round required' }), { status: 400, headers: cors });
  }

  async function ft(u, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 5000);
    try {
      const r = await fetch(u, Object.assign({ signal: ac.signal }, opts || {}));
      clearTimeout(t);
      return r;
    } catch (e) { clearTimeout(t); throw e; }
  }

  // ── 1) GitHub Actions cache ───────────────────────────────────
  try {
    const r = await ft(GITHUB_CACHE_URL, {}, 4000);
    if (r.ok) {
      const d = await r.json();
      const complete = d && Number(d.rnk2WnNope) > 0 &&
        Number(d.rnk3WnNope) > 0 && Number(d.rnk4WnNope) > 0 &&
        Number(d.rnk5WnNope) > 0 && Number(d.totSellamnt) > 0;
      if (d && d.returnValue === 'success' && Number(d.drwNo) === round && complete) {
        d._source = 'github-cache';
        return new Response(JSON.stringify(d), { headers: cors });
      }
    }
  } catch (_) {}

  // ── 2) 구 API (common.do) ────────────────────────────────────
  try {
    const r = await ft(
      'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=' + round,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json, */*',
          'Referer': 'https://www.dhlottery.co.kr/',
        },
      },
      6000
    );
    if (r.ok) {
      const txt = await r.text();
      if (txt && txt.trim().charAt(0) === '{') {
        const d = JSON.parse(txt);
        if (d && d.returnValue === 'success') {
          d._source = 'old-api';
          return new Response(JSON.stringify(d), { headers: cors });
        }
      }
    }
  } catch (_) {}

  // ── 3) 새 API center ─────────────────────────────────────────
  try {
    const r = await ft(
      'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=' + round,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json, */*',
          'Referer': 'https://www.dhlottery.co.kr/lt645/result',
        },
      },
      6000
    );
    if (r.ok) {
      const j = await r.json();
      const list = (j && j.data && j.data.list) ? j.data.list : (j && j.list ? j.list : null);
      if (Array.isArray(list) && list.length > 0) {
        let item = null;
        for (let i = 0; i < list.length; i++) {
          if (Number(list[i].ltEpsd) === round) { item = list[i]; break; }
        }
        if (!item) item = list[0];
        const d = {
          returnValue: 'success', _source: 'new-api',
          drwNo: Number(item.ltEpsd || item.drwNo),
          drwNoDate: item.drwNoDate || fmtDate(item.ltRflYmd),
          drwtNo1: Number(item.tm1WnNo || item.drwtNo1),
          drwtNo2: Number(item.tm2WnNo || item.drwtNo2),
          drwtNo3: Number(item.tm3WnNo || item.drwtNo3),
          drwtNo4: Number(item.tm4WnNo || item.drwtNo4),
          drwtNo5: Number(item.tm5WnNo || item.drwtNo5),
          drwtNo6: Number(item.tm6WnNo || item.drwtNo6),
          bnusNo: Number(item.bnsWnNo || item.bnusNo),
          firstWinamnt: Number(item.rnk1WnAmt || item.firstWinamnt || 0),
          firstPrzwnerCo: Number(item.rnk1WnNope || item.firstPrzwnerCo || 0),
          rnk2WnAmt: Number(item.rnk2WnAmt || 0),
          rnk2WnNope: Number(item.rnk2WnNope || 0),
          rnk3WnNope: Number(item.rnk3WnNope || 0),
          rnk4WnNope: Number(item.rnk4WnNope || 0),
          rnk5WnNope: Number(item.rnk5WnNope || 0),
          rnk1AutoNope: 0,
          rnk1ManualNope: 0,
          rnk2AutoNope: 0,
          rnk2ManualNope: 0,
          rnk3WnAmt: Number(item.rnk3WnAmt || 0),
          rnk4WnAmt: Number(item.rnk4WnAmt || 0),
          rnk5WnAmt: Number(item.rnk5WnAmt || 0),
          totSellamnt: Number(item.rlvtEpsdSumNtslAmt || item.totSellamnt || 0),
        };
        return new Response(JSON.stringify(d), { headers: cors });
      }
    }
  } catch (_) {}

  return new Response(
    JSON.stringify({ returnValue: 'fail', error: 'all methods failed', round }),
    { status: 500, headers: cors }
  );
}

function fmtDate(ymd) {
  if (!ymd || String(ymd).length !== 8) return ymd || '';
  const s = String(ymd);
  return s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8);
}
