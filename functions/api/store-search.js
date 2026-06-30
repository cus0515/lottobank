// 동행복권 판매점 키워드 검색을 프록시하는 Cloudflare Pages Function
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
  if (!query || query.length < 2) {
    return new Response(JSON.stringify({ stores: [], error: '검색어 2자 이상 입력하세요.' }), { headers: cors });
  }
  try {
    const apiUrl = `https://www.dhlottery.co.kr/store/main.do?method=sellerInfo645Ajax&searchWord=${encodeURIComponent(query)}&nowPage=1&pageSize=20`;
    const r = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'Referer': 'https://www.dhlottery.co.kr/store/main.do',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error('응답 파싱 실패'); }
    const list = json?.arr || json?.list || json?.data?.list || json?.result || [];
    const stores = list.map(item => ({
      id: String(item.RTLRID || item.rtlrId || item.storeId || item.STORE_ID || Math.random()),
      name: item.RTLRNM || item.rtlrNm || item.storeName || item.STORE_NM || '',
      address: item.BPLCDORODADDR || item.roadAddress || item.storeAddr || item.STORE_ADDR || item.BPLCDADDR || '',
      region: item.BPLCLOCPLCDNM || item.region || '',
      lat: parseFloat(item.LATITUDE || item.lat || 0) || null,
      lng: parseFloat(item.LONGITUDE || item.lng || 0) || null,
    })).filter(s => s.name);
    return new Response(JSON.stringify({ stores }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ stores: [], error: e.message }), { headers: cors });
  }
}
