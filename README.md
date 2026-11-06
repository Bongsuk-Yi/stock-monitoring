# 수급분석 모니터링 (stock-monitoring)

주소: https://bongsuk-yi.github.io/stock-monitoring/

코스피 시가총액 상위 200 + 코스닥 상위 150 종목의 외국인·기관 수급을 매일 수집해 매집 신호와 종합 판단(매수진입·매수대기·매수보류·매수불가)을 보여 주는 개인용 대시보드입니다.

- 탭: 시장 · 판단 · 강한진입 · 업종 · 차트 · 표 · 세력 · 목록 · 모의투자
- 신호: ① 눌림 매수 ② 매집 간격 확산 ③ 거래량 폭발 → 2개 이상이면 「강한 진입」
- 세력합 = 외국인 + 기관계 (네이버 증권 공개 자료 기준)
- 판단 기준선은 화면에서 바꿀 수 있고 브라우저에 저장됩니다
- PRISM-INSIGHT 규칙(`scripts/prism-rules.mjs`, 일봉용으로 새로 구현):
  - **급등주 포착** 6종(거래량 급증·갭 상승·시총 대비 자금 유입·일중 상승률·마감 강도·거래량 증가 횡보) — 「포착」 탭, 최근 20거래일
  - **시장 국면**(Market Pulse: 분산일·추종일 기반 상승/압박/조정) + 지수 이동평균 요약 — 「시장」 탭, 판단 ③에 반영 옵션
  - **상대강도 RS**(2×3개월 + 6·9·12개월 수익률, 1~99) — 종목 요약·판단·목록·포착
  - 출처: https://github.com/dragon1086/prism-insight (규칙 아이디어 참고, 코드는 새로 작성)

## AI 분석 리포트
GitHub → Actions → **AI 리포트 요청** → Run workflow 에 종목 코드(예: 005930, NVDA)를 넣으면
PRISM-INSIGHT 에이전트가 리포트를 만들어 사이트(판단 탭·목록 탭)에 암호화해 올립니다.
- AI 모델: Google **Gemini** (LiteLLM 프록시로 PRISM 의 OpenAI 호출을 Gemini 로 연결). 기본은 쓸 수 있는 가장 높은 Pro 모델 자동 선택, 저장소 Variable `GEMINI_MODEL` 로 지정 가능
- 필요한 Secret: `GEMINI_API_KEY` (선택: `PERPLEXITY_API_KEY` 또는 `TAVILY_API_KEY` 뉴스 검색, `FIRECRAWL_API_KEY`)
- 한국 종목 시세는 **네이버 증권**(`scripts/report/naver_source.py`)으로 받습니다. KIS 키 3종(`KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_ACCOUNT`)을 넣으면 KIS를 씁니다.

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
