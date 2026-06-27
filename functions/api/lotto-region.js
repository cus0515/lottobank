// 동행복권 1등/2등 당첨 판매소 조회 Cloudflare Pages Function (로또 + 연금복권 지원)
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');
  const type = url.searchParams.get('type') || 'lotto';

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round required' }), { status: 400, headers: cors });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function ft(u, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 8000);
    try {
      const r = await fetch(u, Object.assign({ signal: ac.signal }, opts || {}));
      clearTimeout(t); return r;
    } catch(e) { clearTimeout(t); throw e; }
  }

  // ── 연금복권: pt720 전용 API ──────────────────────────────────────
  if (type === 'pension') {
    try {
      const endpoints = [
        `https://www.dhlottery.co.kr/pt720/selectPstPt720WnShpList.do?srchPsltEpsd=${round}`,
        `https://www.dhlottery.co.kr/pt720/selectPstPt720WnShpInfo.do?srchPsltEpsd=${round}`,
      ];
      for (const ep of endpoints) {
        try {
          const r = await ft(ep, { headers: { ...headers, Referer: 'https://www.dhlottery.co.kr/pt720/result' } });
          if (!r.ok) continue;
          const txt = await r.text();
          if (!txt || txt.trim().charAt(0) !== '{') continue;
          const json = JSON.parse(txt);
          const list = json?.data?.result ?? json?.data?.list ?? json?.data ?? [];
          if (!Array.isArray(list) || list.length === 0) continue;

          const stores1 = [], stores2 = [];
          for (const item of list) {
            const rnk = item.wnShpRnk ?? item.rnk ?? item.rank;
            const store = {
              name: item.shpNm ?? item.storeName ?? item.nm ?? '',
              addr: (item.shpAddr ?? item.addr ?? item.address ?? '').trim(),
              region: (item.tm1ShpLctnAddr ?? item.region ?? item.lctnAddr ?? '').trim(),
              auto: item.atmtPsvYn === 'Q' ? '자동' : item.atmtPsvYn === 'S' ? '수동' : (item.autoYn ?? ''),
            };
            if (rnk == 1) stores1.push(store);
            else if (rnk == 2) stores2.push(store);
          }
          if (stores1.length > 0 || stores2.length > 0) {
            return new Response(JSON.stringify({ stores1, stores2 }), { headers: cors });
          }
        } catch(_) {}
      }
    } catch(_) {}
    // pt720 API 실패 시 빈 응답 반환 (잘못된 데이터 방지)
    return new Response(JSON.stringify({ stores1: [], stores2: [], _unavailable: true }), { headers: cors });
  }

  // ── 로또: 기존 wnprchsplcsrch 엔드포인트 ────────────────────────
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(
      `https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do?srchWnShpRnk=all&srchLtEpsd=${round}&srchShpLctn=`,
      { signal: ac.signal, headers }
    );
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);

    const json = await r.json();
    const list = json?.data?.list ?? [];
    const stores1 = [], stores2 = [];

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
    return new Response(JSON.stringify({ stores1, stores2 }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ stores1: [], stores2: [], error: e.message }), { headers: cors });
  }
}
