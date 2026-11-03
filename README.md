# 수급 대시보드 (supply-dash)

코스피 시가총액 상위 200 + 코스닥 상위 150 종목의 외국인·기관 수급을 매일 수집해 매집 신호와 종합 판단(매수진입·매수대기·매수보류·매수불가)을 보여 주는 개인용 대시보드입니다.

- 탭: 시장 · 판단 · 강한진입 · 업종 · 차트 · 표 · 세력 · 목록 · 모의투자
- 신호: ① 눌림 매수 ② 매집 간격 확산 ③ 거래량 폭발 → 2개 이상이면 「강한 진입」
- 세력합 = 외국인 + 기관계 (네이버 증권 공개 자료 기준)
- 판단 기준선은 화면에서 바꿀 수 있고 브라우저에 저장됩니다

## 동작 방식
1. GitHub Actions(`.github/workflows/update.yml`)가 평일 장 마감 뒤 `scripts/collect.mjs`로 자료를 수집합니다.
2. 누적 자료는 암호화해 `data` 브랜치의 `store.enc.json`에 보관합니다.
3. `scripts/build.mjs`가 분석 결과·종목 자료·HTML을 모두 암호화해 `dist/`를 만들고 GitHub Pages로 배포합니다.

## 비밀번호
모든 화면과 자료는 AES-256-GCM(PBKDF2-SHA256 310,000회)으로 암호화되어, 비밀번호 없이는 볼 수 없습니다.
비밀번호는 **Settings → Secrets and variables → Actions → `SITE_PASSWORD`** 에만 둡니다.
바꾸려면 Secret을 바꾼 뒤 Actions에서 워크플로를 다시 실행하세요(이전 수집 자료는 옛 비밀번호로 잠겨 있어 처음부터 다시 수집됩니다).

## 로컬 실행
```
npm ci
SITE_PASSWORD=... npm run collect
SITE_PASSWORD=... npm run build
npm start
```

참고 지표이며 투자 권유가 아닙니다.
