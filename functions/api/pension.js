// 연금복권 720+ 당첨번호 조회 Cloudflare Pages Function
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=600',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round required' }), { status: 400, headers: cors });
  }

  async function ft(u, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 6000);
    try {
      const r = await fetch(u, Object.assign({ signal: ac.signal }, opts || {}));
      clearTimeout(t);
      return r;
    } catch (e) { clearTimeout(t); throw e; }
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=win720s',
  };

  try {
    const r = await ft(
      `https://www.dhlottery.co.kr/common.do?method=getPension720Number&drwNo=${round}`,
      { headers }
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d || d.returnValue === 'fail') throw new Error('no data');
    return new Response(JSON.stringify(d), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors });
  }
}
