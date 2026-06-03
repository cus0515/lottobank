// =====================
// fortune.js - 운세
// =====================

const Fortune = (() => {

  const ZODIAC = ['쥐','소','호랑이','토끼','용','뱀','말','양','원숭이','닭','개','돼지'];
  const ZODIAC_EMOJI = ['🐭','🐮','🐯','🐰','🐲','🐍','🐴','🐑','🐵','🐔','🐶','🐷'];

  const COMMENTS = [
    { money:82, love:65, health:90, text:'오늘은 <strong>단기 수익 실현에 유리한 날</strong>. 예상치 못한 곳에서 횡재가 올 수 있으나 충동 투자는 자제. 행운 번호 <strong>3, 17</strong>.' },
    { money:55, love:88, health:72, text:'재물보다 <strong>인간관계에 투자할 날</strong>. 오래된 지인에게 연락해보세요. 좋은 정보가 들어올 수 있음. 행운 번호 <strong>7, 29</strong>.' },
    { money:95, love:40, health:68, text:'<strong>재물운 최고조</strong>. 오늘 구매한 복권은 평소보다 기운이 강함. 단, 감정 소비 주의. 행운 번호 <strong>1, 42</strong>.' },
    { money:30, love:75, health:95, text:'오늘은 몸과 마음을 <strong>충전하는 날</strong>. 무리한 투자보다 건강 관리에 집중. 내일 운이 더 좋을 예정. 행운 번호 <strong>11, 33</strong>.' },
    { money:70, love:70, health:70, text:'모든 운이 <strong>균형 잡힌 평온한 날</strong>. 큰 변동 없이 안정적. 꾸준함이 답. 행운 번호 <strong>5, 22</strong>.' },
    { money:88, love:55, health:60, text:'<strong>금전 거래에 유리한 날</strong>. 오전보다 오후에 더 강한 기운. 서쪽 방향이 길한 방위. 행운 번호 <strong>8, 38</strong>.' },
    { money:45, love:92, health:80, text:'<strong>애정운이 폭발적인 날</strong>. 재물 욕심은 잠시 내려두고 주변 사람에게 집중. 행운 번호 <strong>14, 25</strong>.' },
  ];

  function getZodiac(year) {
    return (year - 4) % 12;
  }

  function getTodayFortune() {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth()+1) * 100 + today.getDate();
    const idx = seed % COMMENTS.length;
    return { ...COMMENTS[idx], date: today };
  }

  function getZodiacFortune(birthYear) {
    const z = getZodiac(birthYear);
    const today = new Date();
    const seed = (today.getFullYear() * 10000 + (today.getMonth()+1) * 100 + today.getDate() + z) % COMMENTS.length;
    return { ...COMMENTS[seed], zodiac: ZODIAC[z], emoji: ZODIAC_EMOJI[z] };
  }

  function formatDate(d) {
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  }

  return { getTodayFortune, getZodiacFortune, ZODIAC, ZODIAC_EMOJI, getZodiac, formatDate };
})();
