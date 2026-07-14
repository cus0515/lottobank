# LottoBank Google Play 앱 등록 가이드

## 현재 추천 방식

LottoBank는 이미 Cloudflare Pages에서 동작하는 웹앱이므로 첫 앱 출시는 TWA 방식이 가장 빠릅니다.

TWA는 Android 앱 안에서 `https://lottobank.pages.dev`를 신뢰된 웹앱으로 여는 방식입니다.

## 앱 기본값

- 앱 이름. LottoBank.
- 패키지명. `com.lottobank.app`.
- 기본 URL. `https://lottobank.pages.dev/`.
- 개인정보처리방침. `https://lottobank.pages.dev/privacy.html`.
- 이용약관. `https://lottobank.pages.dev/terms.html`.
- 카테고리. 도구 또는 라이프스타일.
- 광고 포함. 예.
- 계정 생성. 예.
- 사용자 제작 콘텐츠. 예.
- 위치 권한. 지도에서 주변 판매점 조회에만 사용.
- 카메라 권한. QR 코드 촬영에만 사용.

## 준비 파일

- `icon-512.png`.
- `feature-graphic.png`.
- `manifest.json`.
- `play-store/twa-manifest.json`.
- `play-store/assetlinks-template.json`.
- `play-store/closed-test-checklist.md`.

## Android 앱 만들기 순서

1. Android Studio 또는 Bubblewrap 환경을 준비합니다.
2. TWA 프로젝트를 생성합니다.
3. 패키지명을 `com.lottobank.app`으로 설정합니다.
4. 앱 이름을 `LottoBank`로 설정합니다.
5. 시작 URL을 `https://lottobank.pages.dev/`로 설정합니다.
6. 서명 키를 생성합니다.
7. SHA-256 지문을 확인합니다.
8. `assetlinks-template.json`의 SHA-256 값을 실제 값으로 교체합니다.
9. `.well-known/assetlinks.json`으로 사이트 루트에 배포합니다.
10. Android App Bundle `.aab` 파일을 빌드합니다.
11. Play Console 내부 테스트에 먼저 업로드합니다.
12. 비공개 테스트 트랙을 만들고 테스터를 등록합니다.

## 비공개 테스트 기준

2023년 11월 13일 이후 생성된 개인 개발자 계정은 12명 이상의 테스터가 최근 14일 이상 연속으로 비공개 테스트에 참여해야 프로덕션 신청이 가능합니다.

테스터는 설치만 해두는 것보다 QR 인증, 회차 조회, 연구소, 커뮤니티, 전적 화면을 실제로 사용하게 안내하는 것이 좋습니다.

## 스토어 설명 초안

```text
LottoBank는 로또 6/45와 연금복권 720+ 구매 이력을 관리하는 복권 전적 플랫폼입니다.

QR 코드와 인터넷 구매 캡처를 등록하면 회차, 구매 번호, 당첨 여부, 당첨금, 수익률을 한 곳에서 정리할 수 있습니다.

주요 기능
- 로또 6/45·연금복권 720+ 당첨번호 조회
- QR 코드 기반 구매 이력 등록
- 인터넷 구매 캡처 등록
- 나의 구매·당첨·수익률 전적 관리
- 인증 데이터 기반 랭킹
- 번호 레이더와 복권 연구소
- 추천번호 공유 커뮤니티

LottoBank는 동행복권 공식 서비스가 아니며, 복권 구매 대행을 제공하지 않습니다.
당첨 결과 확인은 동행복권 공식 정보를 기준으로 합니다.
```

## 등록 전 점검

- 모바일 첫 화면이 깨지지 않는지 확인합니다.
- QR 촬영 권한 요청 문구가 자연스러운지 확인합니다.
- 위치 권한 거부 시에도 지도 화면이 멈추지 않는지 확인합니다.
- 로그인 없이 접근 가능한 콘텐츠가 충분한지 확인합니다.
- 커뮤니티 신고와 삭제 정책을 운영 문서에 적습니다.
- 개인정보처리방침에 수집 항목, 사용 목적, 삭제 방법을 반영합니다.
