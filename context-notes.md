# LottoBank 연금 판매소 API 연동 컨텍스트 노트

- 공식 연금 결과 페이지의 당첨판매점 버튼은 `/wnprchsplcsrch/home?ltGds=pt720&ltEpsd=회차`로 이동한다.
- 해당 판매소 페이지 내부에서 연금복권은 `/wnprchsplcsrch/selectPtWnShp.do`를 호출한다.
- 기존 후보였던 `/pt720/selectPstPt720WnShpList.do`와 `/pt720/selectPstPt720WnShpInfo.do`는 JSON이 아니라 HTML을 반환한다.
- 321회 기준 `/wnprchsplcsrch/selectPtWnShp.do?srchWnShpRnk=1&srchLtEpsd=321&srchShpLctn=`은 1건, `srchWnShpRnk=2`는 4건을 반환한다.

- `functions/api/lotto-region.js`의 연금 분기는 `selectPtWnShp.do` 단일 호출로 변경하고, `wnShpRnk` 값이 `1`, `2`인 항목만 각각 `stores1`, `stores2`로 분리한다.
- 연금 판매소 응답에는 자동/수동 필드가 없으므로, UI 요약은 자동/수동 값이 있을 때만 표시하고 없으면 `판매소 N`으로 표시한다.
- 직접 함수 호출 검증 결과 321회 연금은 1등 1곳, 2등 4곳을 반환했고, 1230회 로또 판매소도 정상 응답했다.
- `index.html`의 실행 가능한 인라인 스크립트 3개는 `vm.Script` 문법 검사를 통과했다. JSON-LD 스크립트는 실행 스크립트가 아니어서 검사 대상에서 제외했다.
