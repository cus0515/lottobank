/**
 * Cloudflare Pages Function: /api/lotto?round=1226
 *
 * 우선순위:
 *   1) GitHub Actions 캐시 (raw.githubusercontent.com) — 가장 빠름
 *   2) 새 dhlottery API (2026) — center/right
 *   3) 구 dhlottery API (common.do)
 *   4) HTML 결과 페이지 스크래핑 — 수동/자동, 당첨지역 포함
 */

const GITHUB_CACHE_URL =
  'https://raw.githubusercontent.com/cus0515/lottobank/main/lotto-cache.json';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const round = parseInt(url.searchParams.get('round') || '0');

  const cors = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
  };

  if (!round || round < 1) {
    return new Response(JSON.stringify({ error: 'round parameter required' }), {
      status: 400,
      headers: cors,
    });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    Referer: 'https://www.dhlottery.co.kr/lt645/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function fetchWithTimeout(fetchUrl, opts = {}, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(fetchUrl, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  function buildResult(item, source) {
    return {
      returnValue: 'success',
      _source: source,
      drwNo: Number(item.ltEpsd ?? item.drwNo),
      drwNoDate: item.drwNoDate ?? formatDate(item.ltRflYmd),
      drwtNo1: Number(item.tm1WnNo ?? item.drwtNo1),
      drwtNo2: Number(item.tm2WnNo ?? item.drwtNo2),
      drwtNo3: Number(item.tm3WnNo ?? item.drwtNo3),
      drwtNo4: Number(item.tm4WnNo ?? item.drwtNo4),
      drwtNo5: Number(item.tm5WnNo ?? item.drwtNo5),
      drwtNo6: Number(item.tm6WnNo ?? item.drwtNo6),
      bnusNo: Number(item.bnsWnNo ?? item.bnusNo),
      firstWinamnt: Number(item.rnk1WnAmt ?? item.firstWinamnt ?? 0),
      firstPrzwnerCo: Number(item.rnk1WnNope ?? item.firstPrzwnerCo ?? 0),
      // 2~5등 당첨자 수 (새 API 필드명 시도)
      rnk2WnAmt: Number(item.rnk2WnAmt ?? 0),
      rnk2WnNope: Number(item.rnk2WnNope ?? 0),
      rnk3WnNope: Number(item.rnk3WnNope ?? 0),
      rnk4WnNope: Number(item.rnk4WnNope ?? 0),
      rnk5WnNope: Number(item.rnk5WnNope ?? 0),
      // 수동/자동 (새 API 필드명 시도)
      rnk1AutoNope: Number(item.rnk1AutoWnNope ?? item.rnk1AutoNope ?? 0),
      rnk1ManualNope: Number(item.rnk1ManualWnNope ?? item.rnk1ManualNope ?? 0),
      rnk2AutoNope: Number(item.rnk2AutoWnNope ?? item.rnk2AutoNope ?? 0),
      rnk2ManualNope: Number(item.rnk2ManualWnNope ?? item.rnk2ManualNope ?? 0),
      totSellamnt: Number(item.totSellamnt ?? 0),
    };
  }

  // HTML 결과 페이지에서 상세 데이터 추출
  async function scrapeDetailPage(r) {
    try {
      const pageUrl = `https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${r}`;
      const res = await fetchWithTimeout(pageUrl, {
        headers: {
          'User-Agent': browserHeaders['User-Agent'],
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        }
      }, 8000);
      if (!res.ok) return null;
      const html = await res.text();

      const detail = { regions: [], rankData: {} };

      // 당첨 번호 테이블 파싱 - 등수별 당첨자 수, 수동/자동
      // 패턴: <td>1등</td> ... <td>자동:N / 수동:M</td> ... <td>X명</td> ... <td>Y원</td>
      const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
          .map(td => td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/,/g, '').trim());
        if (cells.length < 3) continue;
        const rankMatch = cells[0]?.match(/^(\d)등$/);
        if (!rankMatch) continue;
        const rank = Number(rankMatch[1]);
        const cntStr = cells.find(c => /^\d+$/.test(c) && Number(c) < 100000);
        const amtStr = cells.find(c => /^\d+$/.test(c) && Number(c) > 100000);
        // 수동/자동 셀
        const autoCell = cells.find(c => c.includes('자동') || c.includes('수동'));
        let autoN = 0, manualN = 0;
        if (autoCell) {
          const am = autoCell.match(/자동[^\d]*(\d+)/); if (am) autoN = Number(am[1]);
          const mm = autoCell.match(/수동[^\d]*(\d+)/); if (mm) manualN = Number(mm[1]);
        }
        detail.rankData[rank] = {
          cnt: cntStr ? Number(cntStr) : 0,
          amt: amtStr ? Number(amtStr) : 0,
          auto: autoN,
          manual: manualN,
        };
      }

      // 당첨지역 파싱
      const regionMatch = html.match(/지역별[\s\S]*?(<table[\s\S]*?<\/table>)/i);
      if (regionMatch) {
        const regionCells = regionMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        regionCells.forEach(td => {
          const text = td.replace(/<[^>]+>/g, '').trim();
          if (text && /[가-힣]/.test(text) && text.length <= 10) detail.regions.push(text);
        });
      }
      // 대안: 1등 지역 목록 파싱
      if (!detail.regions.length) {
        const regionPat = /(?:서울|경기|인천|강원|충북|충남|대전|전북|전남|광주|경북|경남|부산|대구|울산|제주|세종)[^\s<]*/g;
        const regionMatches = html.match(re