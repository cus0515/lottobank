/**
 * Cloudflare Pages Function: /api/lotto-bulk?start=N&end=M
 * Fetches a RANGE of past lotto rounds directly from dhlottery (old API),
 * in parallel, from the Cloudflare edge (not subject to the client/device
 * network restrictions). Used once to backfill full history, and can be
 * reused later for gap-filling. Range is capped to stay under the
 * platform's per-request subrequest limit.
 */

const MAX_RANGE = 250;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  let start = parseInt(url.searchParams.get('start') || '0');
  let end = parseInt(url.searchParams.get('end') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  if (!start || !end || end < start) {
    return new Response(JSON.stringify({ error: 'start and end (inclusive) required' }), { status: 400, headers: cors });
  }
  if (end - start + 1 > MAX_RANGE) {
    end = start + MAX_RANGE - 1;
  }

  async function ft(u, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 6000);
    try {
      const r = await fetch(u, {
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json, */*',
          'Referer': 'https://www.dhlottery.co.kr/',
        },
      });
      clearTimeout(t);
      return r;
    } catch (e) { clearTimeout(t); return null; }
  }

  function fmtDate(ymd) {
    if (!ymd || String(ymd).length !== 8) return ymd || '';
    const s = String(ymd);
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }

  async function fetchOneOld(round) {
    const r = await ft('https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=' + round, 6000);
    if (!r) return { _dbg: 'old:no-response', round };
    if (!r.ok) return { _dbg: 'old:status-' + r.status, round };
    const txt = await r.text();
    if (!txt || txt.trim().charAt(0) !== '{') return { _dbg: 'old:non-json', round, sample: (txt || '').slice(0, 80) };
    const d = JSON.parse(txt);
    if (!d || d.returnValue !== 'success') return { _dbg: 'old:not-success', round };
    return {
      drwNo: Number(d.drwNo),
      drwNoDate: d.drwNoDate,
      numbers: [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6].map(Number),
      bonusNo: Number(d.bnusNo),
      totSellamnt: Number(d.totSellamnt || 0),
      firstWinamnt: Number(d.firstWinamnt || 0),
      firstPrzwnerCo: Number(d.firstPrzwnerCo || 0),
    };
  }

  async function fetchOneNew(round) {
    const r = await ft(
      'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=' + round,
      6000
    );
    if (!r) return { _dbg: 'new:no-response', round };
    if (!r.ok) return { _dbg: 'new:status-' + r.status, round };
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) {
      return { _dbg: 'new:non-json', round, sample: (txt || '').slice(0, 80) };
    }
    const list = (j && j.data && j.data.list) ? j.data.list : (j && j.list ? j.list : null);
    if (!Array.isArray(list) || list.length === 0) return { _dbg: 'new:no-list', round };
    let item = null;
    for (let i = 0; i < list.length; i++) {
      if (Number(list[i].ltEpsd) === round) { item = list[i]; break; }
    }
    if (!item) return { _dbg: 'new:round-not-in-list', round };
    return {
      drwNo: Number(item.ltEpsd || item.drwNo),
      drwNoDate: item.drwNoDate || fmtDate(item.ltRflYmd),
      numbers: [item.tm1WnNo || item.drwtNo1, item.tm2WnNo || item.drwtNo2, item.tm3WnNo || item.drwtNo3,
        item.tm4WnNo || item.drwtNo4, item.tm5WnNo || item.drwtNo5, item.tm6WnNo || item.drwtNo6].map(Number),
      bonusNo: Number(item.bnsWnNo || item.bnusNo),
      totSellamnt: Number(item.rlvtEpsdSumNtslAmt || item.totSellamnt || 0),
      firstWinamnt: Number(item.rnk1WnAmt || item.firstWinamnt || 0),
      firstPrzwnerCo: Number(item.rnk1WnNope || item.firstPrzwnerCo || 0),
    };
  }

  async function fetchOne(round) {
    try {
      // old API (common.do) is permanently returning an HTML block page now — skip it
      // to save subrequests and go straight to the API that actually works.
      const newR = await fetchOneNew(round);
      if (!newR._dbg) return newR;
      return { _dbg: 'new-failed', round, newErr: newR._dbg };
    } catch (e) {
      return { _dbg: 'exception', round, message: String(e && e.message || e) };
    }
  }

  const rounds = [];
  for (let n = start; n <= end; n++) rounds.push(n);

  // Gentle concurrency: 5 in flight at a time, to avoid tripping dhlottery's
  // rate limiting and to stay well under the platform subrequest cap.
  const CONCURRENCY = 5;
  const results = [];
  for (let i = 0; i < rounds.length; i += CONCURRENCY) {
    const batch = rounds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchOne));
    results.push(...batchResults);
  }
  const data = results.filter((x) => x && !x._dbg);
  const errors = results.filter((x) => x && x._dbg);

  return new Response(JSON.stringify({ start, end, count: data.length, data, errors }), { headers: cors });
}
