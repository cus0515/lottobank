// 동행복권 1등/2등 당첨 판매소 조회 Cloudflare Pages Function
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round required' }), { status: 400, headers: cors });
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(
      `https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=all&srchLtEpsd=${round}&srchShpLctn=`,
      {
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json, text/javascript, */*',
          'Referer': 'https://www.dhlottery.co.kr/wnprchsplcsrch/home',
        },
      }
    );
    clearTimeout(t);

    if (!r.ok) throw new Error('HTTP ' + r.status);

    const json = await r.json();
    const list = json?.data?.list ?? [];

    const stores1 = [];
    const stores2 = [];

    for (const item of list) {
      const store = {
        name: item.shpNm || '',
        addr: (item.shpAddr || '').trim(),
        region: (item.tm1ShpLctnAddr || '').trim(),
        auto: item.atmtPsvYn === 'Q' ? '자동' : (item.atmtPsvYn === 'S' ? '수동' : (item.atmtPsvYnTxt || '')),
      };
      if (item.wnShpRnk === 1) stores1.push(store);
      else if (item.wnShpRnk === 2) stores2.push(store);
    }

    return new Response(JSON.stringify({ stores1, stores2, total: list.length }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ stores1: [], stores2: [], error: e.message }), { headers: cors });
  }
}
