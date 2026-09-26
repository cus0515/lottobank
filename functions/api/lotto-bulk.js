/**
 * Cloudflare Pages Function: /api/lotto-bulk?start=N&end=M
 * Fetches a RANGE of past lotto rounds directly from dhlottery (old API),
 * in parallel, from the Cloudflare edge (not subject to the client/device
 * network restrictions). Used once to backfill full history, and can be
 * reused later for gap-filling. Range is capped to stay under the
 * platform's per-request subrequest limit.
 */

const MAX_RANGE = 40;

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

  async function fetchOne(round) {
    try {
      const r = await ft('https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=' + round, 6000);
      if (!r) return { _dbg: 'no-response', round };
      if (!r.ok) return { _dbg: 'status-' + r.status, round };
      const txt = await r.text();
      if (!txt || txt.trim().charAt(0) !== '{') return { _dbg: 'non-json', round, sample: (txt || '').slice(0, 120) };
      const d = JSON.parse(txt);
      if (!d || d.returnValue !== 'success') return { _dbg: 'not-success', round, raw: d };
      return {
        drwNo: Number(d.drwNo),
        drwNoDate: d.drwNoDate,
        numbers: [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6].map(Number),
        bonusNo: Number(d.bnusNo),
        totSellamnt: Number(d.totSellamnt || 0),
        firstWinamnt: Number(d.firstWinamnt || 0),
        firstPrzwnerCo: Number(d.firstPrzwnerCo || 0),
      };
    } catch (e) {
      return { _dbg: 'exception', round, message: String(e && e.message || e) };
    }
  }

  const rounds = [];
  for (let n = start; n <= end; n++) rounds.push(n);
  const results = await Promise.all(rounds.map(fetchOne));
  const data = results.filter((x) => x && !x._dbg);
  const errors = results.filter((x) => x && x._dbg);

  return new Response(JSON.stringify({ start, end, count: data.length, data, errors }), { headers: cors });
}
