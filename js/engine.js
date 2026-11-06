/* 수급 분석 엔진 — 브라우저와 수집 스크립트(Node)가 같은 규칙으로 계산한다.
   입력 rec: { code, name, market, sector, d:[YYYYMMDD], o,h,l,c,v:[], frg:[], org:[] }  (frg/org: 외국인·기관계 순매수 수량, 없으면 null)
   세력합 = 외국인 + 기관계  (무료 공개 자료에서 받을 수 있는 주체 기준) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_CFG = {
    minSignals: 2,                 // ① 수급 후보: 켜진 신호 수
    req: { rebound: false, flow5: false, days5: true, chase: true, rr: false, liquidity: true },
    trend: { strong: false, rebound: false, market: false },
    unknownPass: true,             // 미확인 조건은 통과로 본다
  };
  const CHECKS = [
    ['rebound', '가격 반등 (종가가 직전 3거래일 최고 종가 돌파)'],
    ['flow5', '최근 5일 외국인+기관 순매수 합 > 0'],
    ['days5', '최근 5일 중 세력 순매수일 ≥ 3일'],
    ['chase', '추격매수 제한 (당일 상승률 < 8%)'],
    ['rr', '예상 손익비 ≥ 2 (60일 고점 목표 / 20일 저점 손절)'],
    ['liquidity', '유동성 (20일 평균 거래대금 ≥ 10억원, 거래정지 아님)'],
  ];
  const SIG_NAMES = ['눌림 매수', '매집 간격 확산', '거래량 폭발'];

  const nz = (x) => (x == null || !isFinite(x) ? 0 : +x);
  function sma(a, n) {
    const out = new Array(a.length).fill(null); let s = 0;
    for (let i = 0; i < a.length; i++) { s += nz(a[i]); if (i >= n) s -= nz(a[i - n]); if (i >= n - 1) out[i] = s / n; }
    return out;
  }
  const maxOf = (a, from, to) => { let m = -Infinity; for (let i = Math.max(0, from); i <= to; i++) if (a[i] != null && a[i] > m) m = a[i]; return m; };
  const minOf = (a, from, to) => { let m = Infinity; for (let i = Math.max(0, from); i <= to; i++) if (a[i] != null && a[i] < m) m = a[i]; return m; };
  function pctile(arr, q) { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; }

  // 누적 순매수 → 매집수량(누적 최저점 대비) · 이동평균 · 분산비
  function accumulate(net) {
    const n = net.length, cum = [], acc = [], ratio = [];
    let s = 0, lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      s += nz(net[i]); cum.push(s);
      lo = Math.min(lo, s); const a = s - lo; acc.push(a);
      hi = Math.max(hi, a); ratio.push(hi > 0 ? a / hi : 0);
    }
    return { cum, acc, ma5: sma(acc, 5), ma20: sma(acc, 20), ratio };
  }

  // 종목 하나 전체 분석
  function analyze(rec) {
    const n = rec.c.length, c = rec.c, v = rec.v;
    const net = rec.c.map((_, i) => (rec.frg[i] == null && rec.org[i] == null ? null : nz(rec.frg[i]) + nz(rec.org[i])));
    const F = accumulate(net), FR = accumulate(rec.frg), OR = accumulate(rec.org);
    const pma20 = sma(c, 20), vma20 = sma(v, 20);
    const amt = c.map((x, i) => nz(x) * nz(v[i]));
    const amt20 = sma(amt, 20);
    // 매집 간격(5일선−20일선)을 20일 평균 거래량으로 나눠 종목 간 비교 가능하게
    const gap = F.ma5.map((x, i) => (x == null || F.ma20[i] == null ? null : x - F.ma20[i]));
    const gapN = gap.map((x, i) => (x == null || !vma20[i] ? null : x / vma20[i]));
    const thr = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const pos = []; for (let j = Math.max(0, i - 240); j < i; j++) if (gapN[j] > 0) pos.push(gapN[j]);
      thr[i] = pos.length >= 20 ? pctile(pos, .75) : null;
    }
    const s1 = [], s2 = [], s3 = [], strength = [], cross = [];
    for (let i = 0; i < n; i++) {
      // ① 눌림 매수: 세력 매집이 이어지는 중(5일선>20일선, 분산비 0.8 이상)인데 가격은 직전 5일 고점보다 3% 이상 눌림, 20일선 근처 이상
      const up = F.ma5[i] != null && F.ma20[i] != null && F.ma5[i] > F.ma20[i];
      const hi5 = i >= 5 ? maxOf(c, i - 5, i - 1) : null;
      s1.push(!!(up && F.ratio[i] >= .8 && hi5 && c[i] <= hi5 * .97 && pma20[i] && c[i] >= pma20[i] * .97));
      // ② 매집 간격 확산: 간격이 과거 양(+) 간격의 상위 25% 선을 넘음
      const on2 = thr[i] != null && gapN[i] != null && gapN[i] > thr[i] && gapN[i] > 0;
      s2.push(on2); cross.push(on2 && !(i > 0 && s2[i - 1]));
      // ③ 거래량 폭발: 최근 5일 안에 20일 평균의 2.5배 이상 거래 + 양봉 + 세력 순매수
      let on3 = false;
      for (let j = Math.max(1, i - 4); j <= i; j++) if (vma20[j - 1] && v[j] >= vma20[j - 1] * 2.5 && c[j] > c[j - 1] && nz(net[j]) > 0) { on3 = true; break; }
      s3.push(on3);
      const k = s1[i] + s2[i] + s3[i];
      strength.push(k >= 2 ? '강한 진입' : s1[i] ? '진입' : (s2[i] || s3[i]) ? '진입 준비' : '');
    }
    // 과거 신호 성과: 연속 신호는 첫날만, 20거래일 뒤 종가 기준
    const perf = {};
    const kinds = { s1, s2, s3, strong: strength.map((x) => x === '강한 진입') };
    for (const [k, arr] of Object.entries(kinds)) {
      const rs = []; let last = null;
      for (let i = 1; i < n; i++) if (arr[i] && !arr[i - 1]) { last = rec.d[i]; if (i + 20 < n && c[i]) rs.push(c[i + 20] / c[i] - 1); }
      perf[k] = { n: rs.length, win: rs.length ? rs.filter((r) => r > 0).length / rs.length : null, avg: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, last };
    }
    return { net, F, FR, OR, pma20, vma20, amt20, gap, gapN, thr, s1, s2, s3, cross, strength, perf };
  }

  // 오늘(마지막 날) 기준 요약: 진입 확인 원값과 연속 일수 등. 판단(기준선 적용)은 judge()가 한다.
  function summarize(rec, A) {
    const n = rec.c.length, i = n - 1, c = rec.c;
    if (n < 2) return null;
    const sumN = (arr, k) => { let s = 0; for (let j = Math.max(0, i - k + 1); j <= i; j++) s += nz(arr[j]); return s; };
    const amtN = (arr, k) => { let s = 0; for (let j = Math.max(0, i - k + 1); j <= i; j++) s += nz(arr[j]) * nz(c[j]); return s; };
    const chg = c[i - 1] ? c[i] / c[i - 1] - 1 : 0;
    const hi3 = i >= 3 ? maxOf(c, i - 3, i - 1) : null;
    const tgt = maxOf(rec.h || c, i - 59, i), stop = minOf(rec.l || c, i - 19, i);
    const rr = c[i] > stop ? (tgt - c[i]) / (c[i] - stop) : null;
    const days5 = (() => { let k = 0; for (let j = Math.max(0, i - 4); j <= i; j++) if (nz(A.net[j]) > 0) k++; return k; })();
    let streak = 0; while (streak <= i && A.strength[i - streak] === '강한 진입') streak++;
    let sStart = streak ? rec.d[i - streak + 1] : null;
    // 지금 켜진 신호들의 과거 성과를 합친 값
    const onKeys = ['s1', 's2', 's3'].filter((k) => A[k][i]);
    const pn = onKeys.reduce((s, k) => s + A.perf[k].n, 0);
    const pw = pn ? onKeys.reduce((s, k) => s + (A.perf[k].win || 0) * A.perf[k].n, 0) / pn : null;
    const pa = pn ? onKeys.reduce((s, k) => s + (A.perf[k].avg || 0) * A.perf[k].n, 0) / pn : null;
    const strongToday = A.strength[i] === '강한 진입';
    return {
      code: rec.code, name: rec.name, market: rec.market, sector: rec.sector || '',
      date: rec.d[i], c: c[i], chg, v: rec.v[i],
      ret20: i >= 20 && c[i - 20] ? c[i] / c[i - 20] - 1 : null,
      amt20: A.amt20[i] || 0,
      f1: nz(rec.frg[i]) * c[i], o1: nz(rec.org[i]) * c[i], f5: amtN(rec.frg, 5), o5: amtN(rec.org, 5), f20: amtN(rec.frg, 20), o20: amtN(rec.org, 20),
      sig: [A.s1[i], A.s2[i], A.s3[i]].map(Boolean), strength: A.strength[i], ratio: A.F.ratio[i],
      streak, streakStart: sStart, startClose: streak ? c[i - streak + 1] : null,
      ck: {
        rebound: hi3 == null ? null : c[i] > hi3,
        flow5: sumN(A.net, 5) > 0,
        days5: days5 >= 3,
        chase: chg < .08,
        rr: rr == null ? false : rr >= 2,
        liquidity: (A.amt20[i] || 0) >= 1e9 && nz(rec.v[i]) > 0,
      },
      ckVal: { days5, rr, net5: sumN(A.net, 5), amt20: A.amt20[i] || 0 },
      trendStrong: !!(A.pma20[i] && c[i] >= A.pma20[i] * 1.085 && (A.amt20[i] ? sumN(A.net, 5) * c[i] <= A.amt20[i] * .025 : false)),
      past: { n: pn, win: pw, avg: pa }, perfStrong: A.perf.strong,
      limitUp: chg >= .295, strongToday,
    };
  }

  // 종합 판단: 매수진입 · 매수대기 · 매수보류 · 매수불가
  function judge(s, cfg = DEFAULT_CFG) {
    if (!s) return { verdict: '매수불가', reason: '자료 없음', cand: false };
    const k = s.sig.filter(Boolean).length;
    const cand = k >= cfg.minSignals;
    const fails = [], unknown = [];
    for (const [key] of CHECKS) {
      const v = s.ck[key];
      if (v == null) { unknown.push(key); if (!cfg.unknownPass && cfg.req[key]) fails.push(key); }
      else if (!v && cfg.req[key]) fails.push(key);
    }
    if (!s.ck.liquidity) return { verdict: '매수불가', reason: '유동성 부족 또는 거래정지', cand, fails, unknown, k };
    if (!cand) return { verdict: '매수불가', reason: k ? `수급 신호 ${k}개 (기준 ${cfg.minSignals}개 미만)` : '수급 신호 없음', cand, fails, unknown, k };
    if (fails.length) return { verdict: '매수대기', reason: '진입 확인 대기: ' + fails.map((f) => CHECKS.find((x) => x[0] === f)[1].split(' (')[0]).join(', '), cand, fails, unknown, k };
    const tf = [];
    if (cfg.trend.strong && !s.trendStrong) tf.push('추세 강세 미확인');
    if (cfg.trend.rebound && !s.ck.rebound) tf.push('오늘 반등 미확인');
    if (cfg.trend.market && s.mkt === 'CORRECTION') tf.push(`${s.market} 조정 국면`);
    if (tf.length) return { verdict: '매수보류', reason: tf.join(', '), cand, fails, unknown, k };
    return { verdict: '매수진입', reason: '모든 기준 통과' + (unknown.length ? ' (미확인 조건 포함)' : ''), cand, fails, unknown, k };
  }

  return { DEFAULT_CFG, CHECKS, SIG_NAMES, sma, accumulate, analyze, summarize, judge };
});
