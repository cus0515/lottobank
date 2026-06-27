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
    const t = setTimeout(() => ac.abort(), ms || 7000);
    try {
      const r = await fetch(u, Object.assign({ signal: ac.signal }, opts || {}));
      clearTimeout(t);
      return r;
    } catch (e) { clearTimeout(t); throw e; }
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/pt720/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  // 1) GitHub 캐시
  try {
    const r = await ft('https://raw.githubusercontent.com/cus0515/lottobank/main/pension-cache.json', {}, 5000);
    if (r.ok) {
      const txt = await r.text();
      if (txt && txt.trim().charAt(0) === '{') {
        const cached = JSON.parse(txt);
        if (cached.returnValue === 'success' && cached.drwNo === round) {
          return new Response(JSON.stringify(cached), { headers: cors });
        }
      }
    }
  } catch (_) {}

  // 2) 신규 API (pt720)
  try {
    const listR = await ft('https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do', { headers: browserHeaders }, 8000);
    if (listR.ok) {
      const txt = await listR.text();
      if (txt && txt.trim().charAt(0) === '{') {
        const listData = JSON.parse(txt);
        const item = (listData.data && listData.data.result || []).find(function(r) { return r.psltEpsd === round; });
        if (item) {
          var prizes = [];
          try {
            const infoR = await ft('https://www.dhlottery.co.kr/pt720/selectPstPt720WnInfo.do?srchPsltEpsd=' + round, { headers: browserHeaders }, 8000);
            if (infoR.ok) {
              const infoTxt = await infoR.text();
              if (infoTxt && infoTxt.trim().charAt(0) === '{') {
                const infoData = JSON.parse(infoTxt);
                prizes = (infoData.data && infoData.data.result || []).map(function(p) {
                  return { rank: p.wnRnk, store: p.wnStoreCnt, internet: p.wnInternetCnt, total: p.wnTotalCnt, totAmt: p.totAmt };
                });
              }
            }
          } catch (_) {}
          const dateStr = item.psltRflYmd.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
          return new Response(JSON.stringify({
            returnValue: 'success',
            drwNo: round,
            drwNoDate: dateStr,
            wnBndNo: item.wnBndNo,
            wnRnkVl: item.wnRnkVl,
            bnsRnkVl: item.bnsRnkVl,
            prizes: prizes,
          }), { headers: cors });
        }
      }
    }
  } catch (_) {}

  // 3) 구 API
  try {
    const r = await ft('https://www.dhlottery.co.kr/common.do?method=getPension720Number&drwNo=' + round, { headers: browserHeaders });
    if (r.ok) {
      const txt = await r.text();
      if (txt && txt.trim().charAt(0) === '{') {
        const d = JSON.parse(txt);
        if (d && d.returnValue !== 'fail') {
          const wnRnkVl = [d.winNum1, d.winNum2, d.winNum3, d.winNum4, d.winNum5, d.winNum6].join('');
          return new Response(JSON.stringify({
            returnValue: 'success',
            drwNo: round,
            drwNoDate: d.drwNoDate || '',
            wnBndNo: String(d.firstWiNum || ''),
            wnRnkVl: wnRnkVl,
            bnsRnkVl: String(d.bonusNum || ''),
            prizes: [],
          }), { headers: cors });
        }
      }
    }
  } catch (_) {}

  return new Response(
    JSON.stringify({ returnValue: 'fail', error: 'API unavailable', round: round }),
    { status: 200, headers: cors }
  );
}
