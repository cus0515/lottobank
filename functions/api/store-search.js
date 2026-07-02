// 판매점 검색을 Kakao Local과 동행복권 데이터로 제공한다.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ stores: [], error: '2자 이상 입력' }), { headers: cors });
  }

  // ── 1. Kakao Local API (env: KAKAO_REST_API_KEY) ──────────────
  const kakaoKey = context.env?.KAKAO_REST_API_KEY;
  if (kakaoKey) {
    try {
      const keyword = /로또|복권/.test(query) ? query : `${query} 복권`;
      const kakaoUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&size=15&sort=accuracy`;
      const r = await fetch(kakaoUrl, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const json = await r.json();
        const docs = json?.documents || [];
        if (docs.length > 0) {
          const stores = docs.map(d => ({
            id: 'kakao_' + d.id,
            name: d.place_name,
            address: d.road_address_name || d.address_name || '',
            region: (d.address_name || '').split(' ').slice(0, 2).join(' '),
            lat: parseFloat(d.y) || null,
            lng: parseFloat(d.x) || null,
          }));
          return new Response(JSON.stringify({ stores, source: 'kakao' }), { headers: cors });
        }
      }
    } catch (_) { /* try next */ }
  }

  // ── 2. 동행복권 API ────────────────────────────────────────────
  const dhlHdrs = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://m.dhlottery.co.kr/',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const dhlEndpoints = [
    `https://m.dhlottery.co.kr/mobileUtil.do?method=sellerInfo645Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`,
    `https://www.dhlottery.co.kr/store/main.do?method=sellerInfo645Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`,
  ];
  const parseDhl = (text) => {
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    const list = json?.arr || json?.list || json?.sellerInfoArr || [];
    if (!Array.isArray(list) || !list.length) return null;
    return list.map(item => ({
      id: 'dhlottery_' + String(item.RTLRID || item.rtlrId || Date.now()),
      name: item.RTLRNM || item.rtlrNm || '',
      address: (item.BPLCDORODADDR || item.BPLCDADDR || '').trim(),
      region: (item.BPLCLOCPLCDNM || '').trim(),
      lat: parseFloat(item.LATITUDE || 0) || null,
      lng: parseFloat(item.LONGITUDE || 0) || null,
    })).filter(s => s.name);
  };
  for (const ep of dhlEndpoints) {
    try {
      const r = await fetch(ep, { headers: dhlHdrs, signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const stores = parseDhl(await r.text());
        if (stores?.length) return new Response(JSON.stringify({ stores, source: 'dhlottery' }), { headers: cors });
      }
    } catch (_) { /* try next */ }
  }

  return new Response(JSON.stringify({ stores: [], source: 'none' }), { headers: cors });
}
