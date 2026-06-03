// =====================
// lotto.js - 당첨번호 관련
// =====================

const Lotto = (() => {

  // 공 색상
  function ballColor(n) {
    if (n <= 10) return 'y';
    if (n <= 20) return 'b';
    if (n <= 30) return 'r';
    if (n <= 40) return 'g';
    return 'gr';
  }

  // 공 HTML 생성
  function ballHTML(n, size='') {
    return `<div class="ball ${ballColor(n)} ${size}">${n}</div>`;
  }

  // 보너스볼 HTML
  function bonusHTML(n, size='') {
    return `<span class="ball-plus">+</span><div class="ball bonus ${size}">${n}</div>`;
  }

  // 로또 당첨번호 조회 (동행복권 API - CORS 우회용 프록시 사용)
  async function fetchLotto(round) {
    try {
      const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
      // CORS 문제로 allorigins 프록시 사용
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy);
      const json = await res.json();
      const data = JSON.parse(json.contents);
      if (data.returnValue !== 'success') return null;
      return {
        round: data.drwNo,
        date: data.drwNoDate,
        nums: [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6],
        bonus: data.bnusNo,
        prize1: data.firstWinamnt,
        prize1Cnt: data.firstPrzwnerCo,
        totalSales: data.totSellamnt
      };
    } catch(e) {
      console.warn('로또 API 오류:', e);
      return null;
    }
  }

  // 연금복권 당첨번호 조회
  async function fetchPension(round) {
    try {
      const url = `https://www.dhlottery.co.kr/gameResult.do?method=win720&Round=${round}`;
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy);
      const json = await res.json();
      // HTML 파싱
      const parser = new DOMParser();
      const doc = parser.parseFromString(json.contents, 'text/html');
      const nums = doc.querySelectorAll('.num.win720 span');
      if (!nums.length) return null;
      const result = { round, nums: [], group: '' };
      nums.forEach((el, i) => {
        if (i === 0) result.group = el.textContent.trim();
        else result.nums.push(el.textContent.trim());
      });
      return result;
    } catch(e) {
      console.warn('연금복권 API 오류:', e);
      return null;
    }
  }

  // 최신 회차 구하기 (로또: 2002.12.07 첫회, 매주 토요일)
  function getLatestRound() {
    const start = new Date('2002-11-23');
    const now = new Date();
    const diff = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
    return diff;
  }

  // 번호 유효성 검사
  function validateNums(nums) {
    if (nums.length !== 6) return false;
    const set = new Set(nums);
    if (set.size !== 6) return false;
    return nums.every(n => n >= 1 && n <= 45);
  }

  // 당첨 확인
  function checkWin(myNums, winNums, bonus) {
    const matched = myNums.filter(n => winNums.includes(n)).length;
    const hasBonus = myNums.includes(bonus);
    if (matched === 6) return { rank: 1, label: '1등', color: 'gold' };
    if (matched === 5 && hasBonus) return { rank: 2, label: '2등', color: 'gold' };
    if (matched === 5) return { rank: 3, label: '3등', color: 'green' };
    if (matched === 4) return { rank: 4, label: '4등', color: 'blue' };
    if (matched === 3) return { rank: 5, label: '5등 (+5,000원)', color: 'accent' };
    return { rank: 0, label: '낙첨', color: 'red' };
  }

  // 랜덤 번호 생성
  function randomNums() {
    const nums = [];
    while (nums.length < 6) {
      const n = Math.floor(Math.random() * 45) + 1;
      if (!nums.includes(n)) nums.push(n);
    }
    return nums.sort((a, b) => a - b);
  }

  // 홈용 당첨금 표시
  function formatPrize(amount) {
    if (!amount) return '집계중';
    if (amount >= 1e8) return `${(amount / 1e8).toFixed(1)}억원`;
    return `${(amount / 1e4).toFixed(0)}만원`;
  }

  return { ballColor, ballHTML, bonusHTML, fetchLotto, fetchPension, getLatestRound, validateNums, checkWin, randomNums, formatPrize };
})();
