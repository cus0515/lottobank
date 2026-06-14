/**
 * Cloudflare Pages Function: /api/lotto-region?round=N
 * 동행복권 당첨 지역 스크래핑 전용 엔드포인트
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round required' }), { status: 400, headers: cors });
  }

  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(
      `https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`,
      {
        signal: ac.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://www.dhlottery.co.kr/',
        },
      }
    );
    clearTimeout(t);

    if (!r.ok) throw new Error('HTTP ' + r.status);

    const buf = await r.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buf);

    // 당첨 판매점 지역 추출: 주소 td에서 시/도 단위 파싱
    const regions = [];
    const seen = new Set();

    // 패턴 1: 주소 칸에서 첫 번째 시/도 단어 추출
    const addrMatches = html.matchAll(/<td[^>]*>\s*([가-힣]+(?:특별시|광역시|특별자치시|특별자치도|시|도))\s+[가-힣]/g);
    for (const m of addrMatches) {
      const r = m[1].trim();
      if (r && !seen.has(r)) { seen.add(r); regions.push(r); }
    }

    // 패턴 2: 더 넓게 — 2글자 이상 한글 뒤에 시/도 패턴
    if (regions.length === 0) {
      const m2 = html.matchAll(/([가-힣]{2,6}(?:특별시|광역시|특별자치시|특별자치도|시|도))/g);
      for (const m of m2) {
        const r = m[1].trim();
        if (r && !seen.has(r) && r.length >= 2) { seen.add(r); regions.push(r); }
        if (regions.length >= 20) break;
      }
    }

    return new Response(JSON.stringify({ regions: regions.slice(0, 20) }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ regions: [], error: e.message }), { headers: cors });
  }
}
