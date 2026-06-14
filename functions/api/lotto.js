/**
 * Cloudflare Pages Function: /api/lotto?round=1226
 * Priority: 1) GitHub cache, 2) new API center, 3) new API right, 4) old API, 5) HTML scrape
 */

const GITHUB_CACHE_URL =
  'https://raw.githubusercontent.com/cus0515/lottobank/main/lotto-cache.json';

function formatDate(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

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
      status: 400, headers: cors,
    });
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://www.dhlottery.co.kr/lt645/result',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function fetchWithTimeout(fetchUrl, opts, ms) {
    ms = ms || 6000;
    opts = opts || {};
    const ctrl = new AbortController();
    const t = setTimeout(function() { ctrl.abort(); }, ms);
    try {
      const r = await fetch(fetchUrl, Object.assign({}, opts, { signal: ctrl.signal }));
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
      drwNo: Number(item.ltEpsd != null ? item.ltEpsd : item.drwNo),
      drwNoDate: item.drwNoDate || formatDate(item.ltRflYmd),
      drwtNo1: Number(item.tm1WnNo != null ? item.tm1WnNo : item.drwtNo1),
      drwtNo2: Number(item.tm2WnNo != null ? item.tm2WnNo : item.drwtNo2),
      drwtNo3: Number(item.tm3WnNo != null ? item.tm3WnNo : item.drwtNo3),
      drwtNo4: Number(item.tm4WnNo != null ? item.tm4WnNo : item.drwtNo4),
      drwtNo5: Number(item.tm5WnNo != null ? item.tm5WnNo : item.drwtNo5),
      drwtNo6: Number(item.tm6WnNo != null ? item.tm6WnNo : item.drwtNo6),
      bnusNo: Number(item.bnsWnNo != null ? item.bnsWnNo : item.bnusNo),
      firstWinamnt: Number(item.rnk1WnAmt || item.firstWinamnt || 0),
      firstPrzwnerCo: Number(item.rnk1WnNope || item.firstPrzwnerCo || 0),
      rnk2WnAmt: Number(item.rnk2WnAmt || 0),
      rnk2WnNope: Number(item.rnk2WnNope || 0),
      rnk3WnNope: Number(item.rnk3WnNope || 0),
      rnk4WnNope: Number(item.rnk4WnNope || 0),
      rnk5WnNope: Number(item.rnk5WnNope || 0),
      rnk1AutoNope: Number(item.rnk1AutoWnNope || item.rnk1AutoNope || 0),
      rnk1ManualNope: Number(item.rnk1ManualWnNope || item.rnk1ManualNope || 0),
      rnk2AutoNope: Number(item.rnk2AutoWnNope || item.rnk2AutoNope || 0),
      rnk2ManualNope: Number(item.rnk2ManualWnNope || item.rnk2ManualNope || 0),
      totSellamnt: Number(item.totSellamnt || 0),
    };
  }

  async function scrapeDetailPage(r) {
    try {
      var pageUrl = 'https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=' + r;
      var res = await fetchWithTimeout(pageUrl, {
        headers: {
          'User-Agent': browserHeaders['User-Agent'],
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        }
      }, 8000);
      if (!res.ok) return null;
      var html = await res.text();
      var detail = { regions: [], rankData: {} };

      var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var tdMatches = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        var cells = tdMatches.map(function(td) {
          return td.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/,/g, '').trim();
        });
        if (cells.length < 3) continue;
        var rankMatch = cells[0] && cells[0].match(/^(\d)\s*(등)$/);
        if (!rankMatch) continue;
        var rank = Number(rankMatch[1]);
        var nums = cells.filter(function(c) { return /^\d+$/.test(c); }).map(Number);
        var cnt = nums.filter(function(n) { return n < 100000; })[0] || 0;
        var amt = nums.filter(function(n) { return n > 100000; })[0] || 0;
        var autoCell = cells.filter(function(c) {
          return c.indexOf('자동') >= 0 || c.indexOf('수동') >= 0;
        })[0];
        var autoN = 0, manualN = 0;
        if (autoCell) {
          var am = autoCell.match(/자동[^\d]*(\d+)/);
          if (am) autoN = Number(am[1]);
          var mm = autoCell.match(/수동[^\d]*(\d+)/);
          if (mm) manualN = Number(mm[1]);
        }
        detail.rankData[rank] = { cnt: cnt, amt: amt, auto: autoN, manual: manualN };
      }

      var regionPat = /(?:서울|경기|인천|강원|충북|충남|대전|전북|전남|광주|경북|경남|부산|대구|울산|제주|세종)[^\s<]*/g;
      var regionMatches = html.match(regionPat) || [];
      if (regionMatches.length > 0) {
        var seen = {};
        var unique = [];
        for (var j = 0; j < regionMatches.length; j++) {
          if (!seen[regionMatches[j]]) {
            seen[regionMatches[j]] = true;
            unique.push(regionMatches[j]);
          }
        }
        detail.regions = unique.slice(0, 15);
      }

      return detail;
    } catch (e) {
      return null;
    }
  }

  function applyDetail(base, detail) {
    if (!detail) return base;
    var rd = detail.rankData;
    if (rd[2]) {
      if (!base.rnk2WnNope) base.rnk2WnNope = rd[2].cnt;
      if (!base.rnk2WnAmt) base.rnk2WnAmt = rd[2].amt;
      if (!base.rnk2AutoNope) base.rnk2AutoNope = rd[2].auto;
      if (!base.rnk2ManualNope) base.rnk2ManualNope = rd[2].manual;
    }
    if (rd[3] && !base.rnk3WnNope) base.rnk3WnNope = rd[3].cnt;
    if (rd[4] && !base.rnk4WnNope) base.rnk4WnNope = rd[4].cnt;
    if (rd[5] && !base.rnk5WnNope) base.rnk5WnNope = rd[5].cnt;
    if (rd[1]) {
      if (!base.rnk1AutoNope) base.rnk1AutoNope = rd[1].auto;
      if (!base.rnk1ManualNope) base.rnk1ManualNope = rd[1].manual;
    }
    if (detail.regions.length) base.regions = detail.regions;
    return base;
  }

  // Method 0: GitHub Cache
  try {
    var cacheRes = await fetchWithTimeout(GITHUB_CACHE_URL, {}, 4000);
    if (cacheRes.ok) {
      var cached = await cacheRes.json();
      if (cached && cached.returnValue === 'success' && Number(cached.drwNo) === round) {
        cached._source = 'github-cache';
        if (!cached.rnk2WnNope) {
          var det0 = await scrapeDetailPage(round);
          applyDetail(cached, det0);
        }
        return new Response(JSON.stringify(cached), { headers: cors });
      }
    }
  } catch (e) {}

  // Method 1: New API center
  try {
    var apiUrl1 = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=' + round + '&_=' + Date.now();
    var res1 = await fetchWithTimeout(apiUrl1, { headers: browserHeaders }, 6000);
    if (res1.ok) {
      var j1 = await res1.json();
      var list1 = (j1 && j1.data && j1.data.list) ? j1.data.list : (j1 && j1.list ? j1.list : null);
      if (Array.isArray(list1) && list1.length > 0) {
        var item1 = null;
        for (var k = 0; k < list1.length; k++) {
          if (Number(list1[k].ltEpsd) === round) { item1 = list1[k]; break; }
        }
        if (!item1) item1 = list1[0];
        var result1 = buildResult(item1, 'new-api-center');
        var det1 = await scrapeDetailPage(round);
        applyDetail(result1, det1);
        return new Response(JSON.stringify(result1), { headers: cors });
      }
    }
  } catch (e) {}

  // Method 2: New API right
  try {
    var apiUrl2 = 'https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=right&srchLtEpsd=' + (round + 5) + '&_=' + Date.now();
    var res2 = await fetchWithTimeout(apiUrl2, { headers: browserHeaders }, 6000);
    if (res2.ok) {
      var j2 = await res2.json();
      var list2 = (j2 && j2.data && j2.data.list) ? j2.data.list : (j2 && j2.list ? j2.list : null);
      if (Array.isArray(list2) && list2.length > 0) {
        var item2 = null;
        for (var k2 = 0; k2 < list2.length; k2++) {
          if (Number(list2[k2].ltEpsd) === round) { item2 = list2[k2]; break; }
        }
        if (item2) {
          var result2 = buildResult(item2, 'new-api-right');
          var det2 = await scrapeDetailPage(round);
          applyDetail(result2, det2);
          return new Response(JSON.stringify(result2), { headers: cors });
        }
      }
    }
  } catch (e) {}

  // Method 3: Old API
  try {
    var oldUrl = 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=' + round;
    var res3 = await fetchWithTimeout(oldUrl, {
      headers: Object.assign({}, browserHeaders, {
        'Accept': 'application/json, */*',
        'Referer': 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
      }),
    }, 6000);
    if (res3.ok) {
      var text3 = await res3.text();
      if (text3.trim().charAt(0) === '{') {
        var data3 = JSON.parse(text3);
        if (data3 && data3.returnValue === 'success') {
          data3._source = 'old-api';
          var det3 = await scrapeDetailPage(round);
          applyDetail(data3, det3);
          return new Response(JSON.stringify(data3), { headers: cors });
        }
      }
    }
  } catch (e) {}

  // Method 4: HTML scrape only
  try {
    var det4 = await scrapeDetailPage(round);
    if (det4 && det4.rankData[1]) {
      var fallback = {
        returnValue: 'success',
        _source: 'html-scrape',
        drwNo: round,
        drwNoDate: '',
        drwtNo1: 0, drwtNo2: 0, drwtNo3: 0,
        drwtNo4: 0, drwtNo5: 0, drwtNo6: 0, bnusNo: 0,
        firstWinamnt: (det4.rankData[1] || {}).amt || 0,
        firstPrzwnerCo: (det4.rankData[1] || {}).cnt || 0,
        rnk2WnAmt: (det4.rankData[2] || {}).amt || 0,
        rnk2WnNope: (det4.rankData[2] || {}).cnt || 0,
        rnk3WnNope: (det4.rankData[3] || {}).cnt || 0,
        rnk4WnNope: (det4.rankData[4] || {}).cnt || 0,
        rnk5WnNope: (det4.rankData[5] || {}).cnt || 0,
        rnk1AutoNope: (det4.rankData[1] || {}).auto || 0,
        rnk1ManualNope: (det4.rankData[1] || {}).manual || 0,
        rnk2AutoNope: (det4.rankData[2] || {}).auto || 0,
        rnk2ManualNope: (det4.rankData[2] || {}).manual || 0,
        totSellamnt: 0,
        regions: det4.regions,
      };
      return new Response(JSON.stringify(fallback), { headers: cors });
    }
  } catch (e) {}

  return new Response(
    JSON.stringify({ returnValue: 'fail', error: 'all methods failed', round: round }),
    { status: 500, headers: cors }
  );
}
