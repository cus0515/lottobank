// 연금복권 720+ 과거 전체 회차 이력을 pt720 목록 API에서 한 번에 가져와 압축 포맷으로 반환
export async function onRequest(context) {
  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/pt720/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function ft(u, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 10000);
    try {
      const r = await fetch(u, Object.assign({ signal: ac.signal }, opts || {}));
      clearTimeout(t);
      return r;
    } catch (e) { clearTimeout(t); throw e; }
  }

  function fmtDate(ymd) {
    if (!ymd || String(ymd).length !== 8) return ymd || '';
    const s = String(ymd);
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  }

  try {
    const listR = await ft('https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do', { headers: browserHeaders }, 10000);
    const txt = await listR.text();
    const parsed = JSON.parse(txt);
    const items = (parsed.data && parsed.data.result) || parsed.result || [];

    const data = items.map(function (item) {
      return {
        drwNo: Number(item.psltEpsd),
        drwNoDate: fmtDate(item.psltRflYmd),
        group: String(item.wnBndNo),
        number: String(item.wnRnkVl),
        bonusNumber: String(item.bnsRnkVl),
      };
    }).sort(function (a, b) { return a.drwNo - b.drwNo; });

    return new Response(JSON.stringify({ count: data.length, data: data }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
}
