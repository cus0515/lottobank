// 판매점 검색: 동행복권 API 시도 후 실패시 빈 배열 반환
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

  const tryFetch = async (apiUrl, opts) => {
    const r = await fetch(apiUrl, { ...opts, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  };

  const parseStores = (text) => {
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    const list = json?.arr || json?.list || json?.data?.list || json?.result?.list || json?.sellerInfoArr || [];
    if (!Array.isArray(list) || !list.length) return null;
    return list.map(item => ({
      id: String(item.RTLRID || item.rtlrId || item.sellerId || Date.now() + Math.random()),
      name: item.RTLRNM || item.rtlrNm || item.sellerName || item.storeName || '',
      address: (item.BPLCDORODADDR || item.BPLCDADDR || item.roadAddress || item.address || item.storeAddr || '').trim(),
      region: (item.BPLCLOCPLCDNM || item.region || item.sido || '').trim(),
      lat: parseFloat(item.LATITUDE || item.lat || 0) || null,
      lng: parseFloat(item.LONGITUDE || item.lng || 0) || null,
    })).filter(s => s.name);
  };

  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://m.dhlottery.co.kr/',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const endpoints = [
    `https://m.dhlottery.co.kr/mobileUtil.do?method=sellerInfo645Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`,
    `https://www.dhlottery.co.kr/store/main.do?method=sellerInfo645Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`,
    `https://www.dhlottery.co.kr/store/main.do?method=sellerInfo720Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`,
  ];

  for (const ep of endpoints) {
    try {
      const text = await tryFetch(ep, { headers: hdrs });
      const stores = parseStores(text);
      if (stores && stores.length > 0) {
        return new Response(JSON.stringify({ stores, source: 'dhlottery' }), { headers: cors });
      }
    } catch (_) { /* try next */ }
  }

  return new Response(JSON.stringify({ stores: [], source: 'none' }), { headers: cors });
}
