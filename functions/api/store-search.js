// 판매점 검색: Kakao Local → 동행복권 → OpenStreetMap 순으로 시도
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
      const kakaoUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query + ' 로또')}&size=15&sort=accuracy`;
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
      id: String(item.RTLRID || item.rtlrId || Date.now() + Math.random()),
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

  // ── 3. OpenStreetMap Nominatim (무료, 키 불필요) ──────────────
  // 한국 로또 판매점은 OSM에 별도 태그가 없으므로
  // 키워드를 그대로 검색해 지명/주소 기반 결과를 반환
  try {
    const osmQ = encodeURIComponent(query);
    const osmUrl = `https://nominatim.openstreetmap.org/search?q=${osmQ}&format=json&countrycodes=kr&limit=10&addressdetails=1`;
    const r = await fetch(osmUrl, {
      headers: { 'User-Agent': 'LottoBankApp/1.0 (lottobank.pages.dev)', 'Accept-Language': 'ko' },
      signal: AbortSignal.timeout(7000),
    });
    if (r.ok) {
      const items = await r.json();
      if (Array.isArray(items) && items.length > 0) {
        const stores = items.map(item => {
          const nameParts = item.display_name.split(',');
          return {
            id: 'osm_' + item.osm_id,
            name: nameParts[0].trim(),
            address: [item.address?.road, item.address?.quarter || item.address?.suburb, item.address?.city || item.address?.county].filter(Boolean).join(' '),
            region: [item.address?.province || item.address?.state, item.address?.city || item.address?.county].filter(Boolean).join(' '),
            lat: parseFloat(item.lat) || null,
            lng: parseFloat(item.lon) || null,
          };
        }).filter(s => s.name);
        return new Response(JSON.stringify({ stores, source: 'osm' }), { headers: cors });
      }
    }
  } catch (_) { /* fall through */ }

  return new Response(JSON.stringify({ stores: [], source: 'none' }), { headers: cors });
}
