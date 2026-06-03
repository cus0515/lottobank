// =====================
// app.js - 메인 앱
// =====================

// ── 네비게이션 ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('nav-' + id).classList.add('active');
  // 페이지별 렌더
  if (id === 'home') renderHome();
  if (id === 'result') renderResult();
  if (id === 'ticket') renderTicket();
  if (id === 'fortune') renderFortune();
}

// ── 토스트 ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── 공 HTML ──
function makeBalls(nums, bonus, size='') {
  let h = nums.map(n => Lotto.ballHTML(n, size)).join('');
  if (bonus) h += Lotto.bonusHTML(bonus, size);
  return h;
}

// ============================================================
// 홈 페이지
// ============================================================
let homeData = null;

async function renderHome() {
  const el = document.getElementById('home-jackpot');
  el.textContent = '조회 중...';

  const round = Lotto.getLatestRound();
  const data = await Lotto.fetchLotto(round);
  homeData = data;

  if (data) {
    document.getElementById('home-round').textContent = `${data.round}회`;
    document.getElementById('home-date').textContent = data.date;
    document.getElementById('home-jackpot').textContent = Lotto.formatPrize(data.prize1);
    document.getElementById('home-prize1cnt').textContent = `${data.prize1Cnt}명 당첨`;
    document.getElementById('home-balls').innerHTML = makeBalls(data.nums, data.bonus);
  } else {
    document.getElementById('home-jackpot').textContent = '집계중';
    document.getElementById('home-balls').innerHTML = '<span style="color:var(--muted);font-size:13px">데이터 로딩 실패 — 잠시 후 다시 시도</span>';
  }

  // 내 통계
  const stats = MyTicket.calcStats();
  document.getElementById('home-total').textContent = `${stats.total}장`;
  document.getElementById('home-cost').textContent = `-${stats.cost.toLocaleString()}원`;
  document.getElementById('home-earned').textContent = `+${stats.earned.toLocaleString()}원`;
  document.getElementById('home-roi').textContent = `${stats.roi}%`;
  document.getElementById('home-roi').className = 'val ' + (stats.roi >= 0 ? 'green' : 'red');
}

// ============================================================
// 당첨번호 페이지
// ============================================================
let resultTab = 'lotto';
let lottoCache = null;
let pensionCache = null;

async function renderResult() {
  if (resultTab === 'lotto') await renderLottoResult();
  else await renderPensionResult();
}

async function renderLottoResult() {
  const wrap = document.getElementById('result-lotto');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px">조회 중...</div>';

  const round = Lotto.getLatestRound();
  if (!lottoCache || lottoCache.round !== round) {
    lottoCache = await Lotto.fetchLotto(round);
  }
  const d = lottoCache;

  if (!d) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">📡</div><div class="empty-text">데이터를 불러올 수 없어요.<br>잠시 후 다시 시도해주세요.</div></div>';
    return;
  }

  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">
        <span><span class="live-dot"></span>최신 당첨번호</span>
        <span class="badge badge-gold">${d.round}회 · ${d.date}</span>
      </div>
      <div class="balls" style="justify-content:center;margin-bottom:16px">${makeBalls(d.nums, d.bonus)}</div>
      <div class="stat-row">
        <div class="stat-box"><div class="lbl">1등 당첨금</div><div class="val gold">${Lotto.formatPrize(d.prize1)}</div></div>
        <div class="stat-box"><div class="lbl">1등 당첨자</div><div class="val">${d.prize1Cnt}명</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">내 번호 당첨 확인</div>
      <div class="input-wrap">
        <div class="input-label">번호 6개 입력 (쉼표 또는 공백 구분)</div>
        <input class="input" id="check-input" placeholder="예) 1 14 22 31 38 42" type="text" inputmode="numeric">
      </div>
      <button class="btn btn-primary" onclick="checkMyNums()">🔍 당첨 확인</button>
      <div id="check-result" style="margin-top:12px"></div>
    </div>
    <div class="ad-slot">
      <span class="ad-text">🎰 <b>동행복권</b> 이번주 로또 구매하기</span>
      <span class="ad-label">AD</span>
    </div>
    <div class="card">
      <div class="card-title">이전 회차 조회</div>
      <div style="display:flex;gap:8px">
        <input class="input" id="round-input" placeholder="${d.round}회" type="number" min="1" max="${d.round}" style="flex:1">
        <button class="btn btn-secondary" style="width:auto;padding:0 16px" onclick="searchRound()">조회</button>
      </div>
      <div id="round-result" style="margin-top:12px"></div>
    </div>
  `;
}

async function renderPensionResult() {
  const wrap = document.getElementById('result-pension');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--muted);text-align:center;padding:30px">조회 중...</div>';

  // 연금복권 최신 회차 (2011.09.05 시작, 매주 목요일)
  const start = new Date('2011-08-25');
  const now = new Date();
  const pRound = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));

  const d = await Lotto.fetchPension(pRound);

  if (!d || !d.nums.length) {
    wrap.innerHTML = `
      <div class="card">
        <div class="card-title"><span class="live-dot"></span>연금복권 720+</div>
        <div style="color:var(--muted);font-size:13px;text-align:center;padding:20px">
          연금복권 데이터는 매주 목요일 저녁에 업데이트됩니다.<br>
          <a href="https://www.dhlottery.co.kr/gameResult.do?method=win720" target="_blank" 
             style="color:var(--accent);text-decoration:none;margin-top:8px;display:block">
            동행복권 공식 사이트에서 확인 →
          </a>
        </div>
      </div>`;
    return;
  }

  const numsHTML = d.nums.map(n => `<div class="ball b">${n}</div>`).join('');
  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">
        <span><span class="live-dot"></span>연금복권 720+</span>
        <span class="badge badge-blue">${d.round}회</span>
      </div>
      <div style="margin-bottom:10px">
        <span style="font-size:12px;color:var(--muted2)">1등 조번호</span>
        <div style="font-size:28px;font-weight:900;color:var(--gold);margin-top:4px">${d.group}조</div>
      </div>
      <div style="margin-bottom:8px;font-size:12px;color:var(--muted2)">1등 번호</div>
      <div class="balls" style="justify-content:center">${numsHTML}</div>
      <div style="margin-top:14px;font-size:12px;color:var(--muted);text-align:center">
        1등: 월 700만원 × 20년 지급
      </div>
    </div>
    <div class="ad-slot">
      <span class="ad-text">🎰 <b>동행복권</b> 연금복권 구매하기</span>
      <span class="ad-label">AD</span>
    </div>
  `;
}

function switchResultTab(tab) {
  resultTab = tab;
  document.querySelectorAll('#result-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('rtab-' + tab).classList.add('active');
  document.getElementById('result-lotto').style.display = tab === 'lotto' ? 'block' : 'none';
  document.getElementById('result-pension').style.display = tab === 'pension' ? 'block' : 'none';
  renderResult();
}

function checkMyNums() {
  if (!lottoCache) return;
  const raw = document.getElementById('check-input').value;
  const nums = raw.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 45);
  if (!Lotto.validateNums(nums)) {
    document.getElementById('check-result').innerHTML = '<div style="color:var(--red);font-size:13px">⚠️ 1~45 사이 숫자 6개를 입력해주세요</div>';
    return;
  }
  const w = Lotto.checkWin(nums, lottoCache.nums, lottoCache.bonus);
  const colors = { gold:'var(--gold)', green:'var(--green)', blue:'var(--accent)', accent:'var(--accent)', red:'var(--red)' };
  document.getElementById('check-result').innerHTML = `
    <div style="text-align:center;padding:16px;background:var(--card2);border-radius:12px">
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">결과</div>
      <div style="font-size:24px;font-weight:900;color:${colors[w.color]}">${w.label}</div>
      <div class="balls" style="justify-content:center;margin-top:12px">${makeBalls(nums, null, 'sm')}</div>
    </div>`;
}

async function searchRound() {
  const round = parseInt(document.getElementById('round-input').value);
  if (!round || round < 1) return;
  document.getElementById('round-result').innerHTML = '<div style="color:var(--muted);font-size:13px">조회 중...</div>';
  const d = await Lotto.fetchLotto(round);
  if (!d) { document.getElementById('round-result').innerHTML = '<div style="color:var(--red);font-size:13px">데이터 없음</div>'; return; }
  document.getElementById('round-result').innerHTML = `
    <div style="background:var(--card2);border-radius:12px;padding:14px">
      <div style="font-size:12px;color:var(--muted2);margin-bottom:10px">${d.round}회 · ${d.date}</div>
      <div class="balls" style="justify-content:center">${makeBalls(d.nums, d.bonus, 'sm')}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:10px;text-align:center">1등 ${Lotto.formatPrize(d.prize1)} · ${d.prize1Cnt}명</div>
    </div>`;
}

// ============================================================
// 내 복권 페이지
// ============================================================
let ticketTab = 'list';

function renderTicket() {
  if (ticketTab === 'list') renderTicketList();
  if (ticketTab === 'add') renderTicketAdd();
  if (ticketTab === 'stats') renderTicketStats();
}

function switchTicketTab(tab) {
  ticketTab = tab;
  document.querySelectorAll('#ticket-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ttab-' + tab).classList.add('active');
  ['list','add','stats'].forEach(t => {
    document.getElementById('ticket-' + t).style.display = t === tab ? 'block' : 'none';
  });
  renderTicket();
}

function renderTicketList() {
  const wrap = document.getElementById('ticket-list');
  const tickets = MyTicket.getAll();
  const round = Lotto.getLatestRound();

  if (!tickets.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-icon">🎫</div><div class="empty-text">구매한 복권이 없어요.<br>QR 스캔 또는 직접 등록해보세요!</div></div>';
    return;
  }

  wrap.innerHTML = tickets.map(t => {
    const isLotto = t.type === 'lotto';
    const isCurrent = t.round >= round - 1;
    const statusColor = t.prize > 0 ? 'green' : (t.prize === 0 ? 'red' : (isCurrent ? 'gold' : 'red'));
    const statusLabel = t.prize > 0 ? `+${t.prize.toLocaleString()}원` : (t.prize === 0 ? '낙첨' : (isCurrent ? '결과 대기' : '낙첨'));
    const ballsHTML = isLotto ? makeBalls(t.nums, null, 'sm') : t.nums.map(n => `<div class="ball b sm">${n}</div>`).join('');
    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ${isLotto ? 'badge-blue' : 'badge-gold'}">${isLotto ? '로또' : '연금'} ${t.round}회</span>
            <span style="font-size:11px;color:var(--muted)">${t.date}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:13px;font-weight:700;color:var(--${statusColor})">${statusLabel}</span>
            <button onclick="deleteTicket('${t.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:2px">×</button>
          </div>
        </div>
        <div class="balls">${ballsHTML}</div>
      </div>`;
  }).join('');
}

function renderTicketAdd() {
  const wrap = document.getElementById('ticket-add');
  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">QR 스캔으로 등록</div>
      <div style="text-align:center;padding:10px 0 16px">
        <div style="font-size:40px;margin-bottom:10px">📷</div>
        <div style="font-size:13px;color:var(--muted2);margin-bottom:16px">
          로또 용지의 QR코드를 스캔하면<br>번호가 자동으로 등록돼요
        </div>
        <button class="btn btn-primary" onclick="startQRScan()">📷 QR 스캔 시작</button>
      </div>
      <div id="qr-reader" style="display:none;border-radius:12px;overflow:hidden;margin-top:10px"></div>
      <div id="qr-result"></div>
    </div>

    <div style="text-align:center;margin:8px 0;font-size:12px;color:var(--muted)">— 또는 직접 입력 —</div>

    <div class="card">
      <div class="card-title">직접 등록</div>
      <div class="input-wrap">
        <div class="input-label">복권 종류</div>
        <div class="tab-bar" style="margin-bottom:12px">
          <button class="tab-btn active" id="add-type-lotto" onclick="switchAddType('lotto')">로또 6/45</button>
          <button class="tab-btn" id="add-type-pension" onclick="switchAddType('pension')">연금복권</button>
        </div>
      </div>
      <div class="input-wrap">
        <div class="input-label">회차</div>
        <input class="input" id="add-round" placeholder="${Lotto.getLatestRound()}" type="number">
      </div>
      <div class="input-wrap" id="add-nums-wrap">
        <div class="input-label">번호 6개 (쉼표 또는 공백 구분)</div>
        <input class="input" id="add-nums" placeholder="예) 1 14 22 31 38 42" inputmode="numeric">
      </div>
      <div class="input-wrap" id="add-pension-wrap" style="display:none">
        <div class="input-label">조 + 6자리 번호</div>
        <input class="input" id="add-pension-group" placeholder="조 (1-5)" type="number" min="1" max="5" style="margin-bottom:8px">
        <input class="input" id="add-pension-nums" placeholder="6자리 번호 예) 123456" inputmode="numeric">
      </div>
      <button class="btn btn-primary" onclick="manualAdd()">+ 등록하기</button>
    </div>
  `;
}

let addType = 'lotto';
function switchAddType(type) {
  addType = type;
  document.getElementById('add-type-lotto').classList.toggle('active', type==='lotto');
  document.getElementById('add-type-pension').classList.toggle('active', type==='pension');
  document.getElementById('add-nums-wrap').style.display = type==='lotto' ? 'block' : 'none';
  document.getElementById('add-pension-wrap').style.display = type==='pension' ? 'block' : 'none';
}

function manualAdd() {
  const round = parseInt(document.getElementById('add-round').value) || Lotto.getLatestRound();
  if (addType === 'lotto') {
    const raw = document.getElementById('add-nums').value;
    const nums = raw.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 45);
    if (!Lotto.validateNums(nums)) { showToast('⚠️ 1~45 사이 숫자 6개를 입력해주세요'); return; }
    const ok = MyTicket.add({ round, type:'lotto', nums, date: MyTicket.fmtDate(new Date()), prize: null });
    if (!ok) { showToast('이미 등록된 번호예요'); return; }
  } else {
    const group = parseInt(document.getElementById('add-pension-group').value);
    const numsRaw = document.getElementById('add-pension-nums').value.replace(/\s/g,'');
    if (!group || numsRaw.length !== 6) { showToast('⚠️ 조와 6자리 번호를 입력해주세요'); return; }
    const nums = numsRaw.split('').map(Number);
    MyTicket.add({ round, type:'pension', group, nums, date: MyTicket.fmtDate(new Date()), prize: null });
  }
  showToast('✅ 등록됐어요!');
  switchTicketTab('list');
}

function deleteTicket(id) {
  MyTicket.remove(id);
  renderTicketList();
  showToast('삭제됐어요');
}

function renderTicketStats() {
  const wrap = document.getElementById('ticket-stats');
  const s = MyTicket.calcStats();
  wrap.innerHTML = `
    <div class="card">
      <div class="card-title">내 투자 성과 📊</div>
      <div style="text-align:center;padding:10px 0 20px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">총 수익률</div>
        <div style="font-size:42px;font-weight:900;color:${s.roi >= 0 ? 'var(--green)' : 'var(--red)'}">${s.roi}%</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">(수익률 -97% 이상이면 평균입니다 ㅋ)</div>
      </div>
      <div class="stat-row">
        <div class="stat-box"><div class="lbl">총 구매</div><div class="val">${s.total}장</div></div>
        <div class="stat-box"><div class="lbl">총 투자금</div><div class="val red">-${s.cost.toLocaleString()}원</div></div>
        <div class="stat-box"><div class="lbl">총 당첨금</div><div class="val green">+${s.earned.toLocaleString()}원</div></div>
        <div class="stat-box"><div class="lbl">당첨 횟수</div><div class="val">${s.wins}회</div></div>
      </div>
    </div>
    <div class="ad-slot">
      <span class="ad-text">💡 손실을 줄이는 유일한 방법: <b>안 사기</b></span>
      <span class="ad-label">😂</span>
    </div>
  `;
}

// QR 스캔 (html5-qrcode 라이브러리 사용)
let qrScanner = null;
async function startQRScan() {
  const readerEl = document.getElementById('qr-reader');
  readerEl.style.display = 'block';

  // html5-qrcode 동적 로드
  if (!window.Html5Qrcode) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
    document.head.appendChild(s);
    await new Promise(r => s.onload = r);
  }

  if (qrScanner) { try { qrScanner.stop(); } catch{} }
  qrScanner = new Html5Qrcode('qr-reader');
  qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 250 },
    (text) => {
      qrScanner.stop();
      readerEl.style.display = 'none';
      const parsed = MyTicket.parseQR(text);
      if (!parsed) { showToast('⚠️ 동행복권 QR이 아니에요'); return; }
      const ok = MyTicket.add({ ...parsed, date: MyTicket.fmtDate(new Date()), prize: null });
      if (!ok) { showToast('이미 등록된 복권이에요'); return; }
      showToast('✅ QR 등록 완료!');
      switchTicketTab('list');
    },
    () => {}
  ).catch(() => showToast('⚠️ 카메라 권한이 필요해요'));
}

// ============================================================
// 운세 페이지
// ============================================================
function renderFortune() {
  const f = Fortune.getTodayFortune();
  document.getElementById('fortune-date').textContent = Fortune.formatDate(f.date);
  document.getElementById('fortune-money-fill').style.width = f.money + '%';
  document.getElementById('fortune-love-fill').style.width = f.love + '%';
  document.getElementById('fortune-health-fill').style.width = f.health + '%';
  document.getElementById('fortune-money-val').textContent = f.money + '%';
  document.getElementById('fortune-love-val').textContent = f.love + '%';
  document.getElementById('fortune-health-val').textContent = f.health + '%';
  document.getElementById('fortune-comment').innerHTML = f.text;
}

// ── 초기화 ──
window.addEventListener('DOMContentLoaded', () => {
  showPage('home');
});
