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
Claude Code(내 Claude 구독)가 리포트를 써서 사이트(판단 탭·목록 탭)에 암호화해 올립니다.
1. `scripts/report/collect_data.py` — 네이버 증권(한국: 일봉·수급·투자지표·재무·업종·뉴스) / Yahoo(미국: 일봉) 자료를 `brief.md`·`raw_*.json` 으로 저장
2. Claude Code CLI 가 `scripts/report/prompt.md` 지시대로 자료를 읽고 웹 검색으로 실적·공시·이슈를 확인해 리포트 작성
3. `scripts/report/publish.mjs` 가 암호화해 `reports` 브랜치에 저장 → 사이트 재배포
- 필요한 Secret: `CLAUDE_CODE_OAUTH_TOKEN` (PC에서 `claude setup-token` 으로 발급, API 키 아님)
- 선택 Variable: `CLAUDE_MODEL` (예: `opus`, `sonnet`. 비우면 구독 기본 모델)
- 사용량은 Claude 구독 한도에서 차감됩니다(별도 과금 없음).

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
