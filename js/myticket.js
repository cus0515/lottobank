// =====================
// myticket.js - 구매이력/QR
// =====================

const MyTicket = (() => {

  const STORAGE_KEY = 'lottobank_tickets';

  // 저장된 티켓 전체 불러오기
  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  // 저장
  function save(tickets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  }

  // 티켓 추가
  function add(ticket) {
    // ticket = { id, round, type:'lotto'|'pension', nums:[...], date, cost, result:null }
    const list = getAll();
    // 중복 체크 (같은 회차+같은 번호)
    const dup = list.find(t => t.round === ticket.round && JSON.stringify(t.nums) === JSON.stringify(ticket.nums));
    if (dup) return false;
    ticket.id = Date.now().toString();
    list.unshift(ticket);
    save(list);
    return true;
  }

  // 삭제
  function remove(id) {
    const list = getAll().filter(t => t.id !== id);
    save(list);
  }

  // QR URL 파싱 (동행복권 QR)
  // 예: https://m.dhlottery.co.kr/qr.do?method=winQr&v=1141q112233445501
  // v = 회차(4자리) + 게임(1자리) + 번호들
  function parseQR(url) {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('dhlottery')) return null;
      const v = u.searchParams.get('v');
      if (!v) return null;

      // 로또 QR 형식: 회차4자리 + q + 번호6개(2자리씩)
      const lottoMatch = v.match(/^(\d{4})q(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (lottoMatch) {
        return {
          type: 'lotto',
          round: parseInt(lottoMatch[1]),
          nums: [
            parseInt(lottoMatch[2]), parseInt(lottoMatch[3]),
            parseInt(lottoMatch[4]), parseInt(lottoMatch[5]),
            parseInt(lottoMatch[6]), parseInt(lottoMatch[7])
          ].sort((a, b) => a - b)
        };
      }

      // 연금복권 QR 형식: 회차4자리 + p + 조+번호
      const pensionMatch = v.match(/^(\d{4})p(\d)(\d{6})/);
      if (pensionMatch) {
        return {
          type: 'pension',
          round: parseInt(pensionMatch[1]),
          group: parseInt(pensionMatch[2]),
          nums: pensionMatch[3].split('').map(Number)
        };
      }
      return null;
    } catch { return null; }
  }

  // 수익률 계산
  function calcStats() {
    const list = getAll();
    const total = list.length;
    const cost = total * 1000; // 1장 1000원
    let earned = 0;
    let wins = 0;
    list.forEach(t => {
      if (t.prize && t.prize > 0) { earned += t.prize; wins++; }
    });
    const roi = cost > 0 ? ((earned - cost) / cost * 100).toFixed(1) : 0;
    return { total, cost, earned, wins, roi };
  }

  // 날짜 포맷
  function fmtDate(d) {
    const dt = new Date(d);
    return `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}`;
  }

  return { getAll, add, remove, parseQR, calcStats, fmtDate };
})();
