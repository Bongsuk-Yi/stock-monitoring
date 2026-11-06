// PRISM-INSIGHT(https://github.com/dragon1086/prism-insight)가 공개한 규칙을 일봉 자료에 맞춰 새로 구현한 것.
//  1) 급등주 포착 트리거 6종(trigger_batch)  2) 시장 국면 Market Pulse(market_pulse) + 이동평균 요약  3) 오닐식 상대강도 RS
// 원본은 장중 스냅샷으로 오전/오후에 돌리지만, 여기서는 장 마감 후 일봉(시·고·저·종·거래량)으로 계산한다.

/* ───────────── 1. 급등주 포착 ───────────── */
export const SCREEN = {
  minAmount: 10_000_000_000,   // 거래대금 100억원 이상 (원본 SCREENING_MIN_TRADE_VALUE)
  minCap: 500_000_000_000,     // 시가총액 5,000억원 이상 (원본 페니주 필터)
  maxChg: 15,                  // 당일 상승률 15% 이하 (원본 #289 상한)
  volFloor: 0.2,               // 거래량이 분석 종목 평균의 20% 이상
};
export const TRIGGERS = [
  { key: 'volume_surge', name: '거래량 급증', top: 10, desc: '전일 대비 거래량 30% 이상 증가 + 상승 마감(시가·전일 종가 위). 점수 = 거래량 증가율 60% + 거래량 40%' },
  { key: 'gap_up', name: '갭 상승 모멘텀', top: 10, desc: '시가가 전일 종가보다 1% 이상 높게 시작해 시가 위에서 마감. 점수 = 갭 50% + 장중 상승 30% + 거래대금 20%' },
  { key: 'value_to_cap', name: '시총 대비 자금 유입', top: 10, desc: '시가총액 대비 거래대금 비율이 높은 상승 종목. 점수 = 거래대금/시총 50% + 거래대금 30% + 장중 상승 20%' },
  { key: 'daily_rise', name: '일중 상승률 상위', top: 15, desc: '전일 대비 3~15% 상승. 점수 = 상승률 60% + 거래대금 40%' },
  { key: 'closing_strength', name: '마감 강도', top: 15, desc: '고가 근처에서 마감(종가가 당일 범위 위쪽) + 거래량 증가 + 전일 종가 회복. 점수 = 마감 강도 50% + 거래량 증가율 30% + 거래대금 20%' },
  { key: 'volume_flat', name: '거래량 증가 횡보', top: 20, desc: '거래량 50% 이상 증가했지만 등락 ±5% 이내 + 20일선의 97% 이상(매집형 횡보). 점수 = 거래량 증가율 60% + 거래대금 40%' },
];

function norm(rows, key) {
  const v = rows.map((r) => r[key]), lo = Math.min(...v), hi = Math.max(...v), rg = hi > lo ? hi - lo : 1;
  return (r) => (r[key] - lo) / rg;
}
function score(rows, weights) {
  if (!rows.length) return rows;
  const ns = weights.map(([k]) => norm(rows, k));
  rows.forEach((r) => (r.score = weights.reduce((s, [, w], i) => s + ns[i](r) * w, 0)));
  return rows.sort((a, b) => b.score - a.score);
}
const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k] || 0; return s / n; };

/** 날짜 하나에 대해 6개 트리거를 돌린다. recs: 종목 기록 목록, caps: {code: 오늘 시총(원)} */
export function screenDay(recs, date, caps) {
  const base = [];
  for (const r of recs) {
    const i = r.d.indexOf(date); if (i < 1) continue;
    const c = r.c[i], pc = r.c[i - 1], o = r.o[i] || c, h = r.h[i] || c, l = r.l[i] || c, v = r.v[i] || 0, pv = r.v[i - 1] || 0;
    if (!c || !pc || !v) continue;
    const capToday = caps[r.code] || 0, cap = capToday ? capToday * (c / r.c[r.c.length - 1]) : 0;   // 과거 시총은 주가 비율로 환산
    base.push({
      code: r.code, c, v, amount: c * v, cap,
      chg: (c / pc - 1) * 100, intraday: (c / o - 1) * 100, gap: (o / pc - 1) * 100,
      volInc: pv ? (v / pv - 1) * 100 : null, cs: h > l ? (c - l) / (h - l) : 0,
      ratio: cap ? (c * v) / cap * 100 : null, ma20: sma(r.c, i, 20), rising: c > o, aboveOpen: c > o, recovered: c >= pc,
    });
  }
  if (!base.length) return {};
  const meanVol = base.reduce((s, x) => s + x.v, 0) / base.length;
  const pool = base.filter((x) => x.amount >= SCREEN.minAmount && x.v >= meanVol * SCREEN.volFloor && (!x.cap || x.cap >= SCREEN.minCap) && x.chg <= SCREEN.maxChg);
  const pick = (rows, w, top) => score(rows.map((x) => ({ ...x })), w).slice(0, top);
  const out = {};
  out.volume_surge = pick(pool.filter((x) => x.volInc != null && x.volInc >= 30 && x.chg >= 0 && x.rising), [['volInc', .6], ['v', .4]], 10);
  out.gap_up = pick(pool.filter((x) => x.gap >= 1 && x.aboveOpen), [['gap', .5], ['intraday', .3], ['amount', .2]], 10);
  out.value_to_cap = pick(pool.filter((x) => x.ratio != null && x.rising && x.chg >= 0), [['ratio', .5], ['amount', .3], ['intraday', .2]], 10);
  out.daily_rise = pick(pool.filter((x) => x.chg >= 3), [['chg', .6], ['amount', .4]], 15);
  out.closing_strength = pick(pool.filter((x) => x.volInc != null && x.volInc > 0 && x.rising && x.recovered), [['cs', .5], ['volInc', .3], ['amount', .2]], 15);
  out.volume_flat = pick(pool.filter((x) => x.volInc != null && x.volInc >= 50 && Math.abs(x.chg) <= 5 && (!x.ma20 || x.c >= x.ma20 * .97)), [['volInc', .6], ['amount', .4]], 20);
  // 화면에 필요한 값만 남긴다(반올림)
  const r2 = (n, k = 2) => (n == null ? null : Math.round(n * 10 ** k) / 10 ** k);
  for (const k of Object.keys(out)) out[k] = out[k].map((x) => ({ code: x.code, c: x.c, chg: r2(x.chg), gap: r2(x.gap), volInc: r2(x.volInc, 0), cs: r2(x.cs), ratio: r2(x.ratio, 2), amount: Math.round(x.amount / 1e8), score: r2(x.score, 3) }));
  return out;
}

/* ───────────── 2. 시장 국면 (Market Pulse) ───────────── */
export const PULSE = { window: 25, dropPct: 0.2, recoveryPct: 5, pressureDD: 4, correctionDD: 6, drawdownPct: 10, ftdDay: 4, ftdGain: 1.25 };
export const PULSE_KO = { UPTREND: '상승 추세', UNDER_PRESSURE: '압박 받는 상승', CORRECTION: '조정 국면' };

function countDD(c, v, start) {
  const n = c.length; let dd = 0;
  for (let i = Math.max(1, n - PULSE.window, start); i < n; i++) {
    const p = c[i - 1]; if (!(p > 0)) continue;
    const pct = (c[i] - p) / p * 100, volUp = v[i] != null && v[i - 1] != null && v[i] > v[i - 1];
    if (!(pct <= -PULSE.dropPct && volUp)) continue;
    let mx = -Infinity; for (let k = i + 1; k < n; k++) mx = Math.max(mx, c[k]);
    if (mx >= c[i] * (1 + PULSE.recoveryPct / 100)) continue;       // 이후 5% 이상 회복하면 소멸
    dd++;
  }
  return dd;
}
/** 지수 일봉을 처음부터 따라가며 날짜별 국면과 분산일 수를 낸다 */
export function marketPulse(bars) {
  const C = [], V = [], out = [];
  let state = 'UPTREND', ddStart = 0, peak = null, corrLow = null, preCorrPeak = null, rally = false, rallyDay = 0, rallyLow = null, lastDD = 0;
  const toUp = () => { state = 'UPTREND'; ddStart = C.length; lastDD = 0; rally = false; rallyDay = 0; rallyLow = null; corrLow = null; preCorrPeak = null; peak = C.at(-1); };
  for (let i = 0; i < bars.d.length; i++) {
    C.push(bars.c[i]); V.push(bars.v[i] ?? null);
    const cur = C.at(-1), n = C.length, prev = n >= 2 ? C[n - 2] : cur;
    if (peak == null || cur > peak) peak = cur;
    lastDD = countDD(C, V, ddStart);
    let ftd = false;
    if (state === 'CORRECTION') {
      if (corrLow == null) corrLow = cur;
      if (preCorrPeak != null && cur > preCorrPeak) toUp();
      else if (!rally) { if (n >= 2 && cur > prev) { rally = true; rallyDay = 1; rallyLow = corrLow; } else if (cur < corrLow) corrLow = cur; }
      else if (rallyLow != null && cur < rallyLow) { rally = false; rallyDay = 0; corrLow = Math.min(corrLow, cur); rallyLow = null; }
      else {
        rallyDay++;
        const gain = prev > 0 ? (cur - prev) / prev * 100 : 0, hasV = V[n - 1] != null && V[n - 2] != null, vOk = hasV ? V[n - 1] > V[n - 2] : true;
        if (rallyDay >= PULSE.ftdDay && gain >= PULSE.ftdGain && vOk) { toUp(); ftd = true; }
      }
    } else {
      if (cur < peak * (1 - PULSE.drawdownPct / 100) || lastDD >= PULSE.correctionDD) { state = 'CORRECTION'; corrLow = cur; preCorrPeak = peak; rally = false; rallyDay = 0; rallyLow = null; }
      else state = lastDD >= PULSE.pressureDD ? 'UNDER_PRESSURE' : 'UPTREND';
    }
    const p = i ? bars.c[i - 1] : 0, isDD = i > 0 && p > 0 && (bars.c[i] - p) / p * 100 <= -PULSE.dropPct && bars.v[i] != null && bars.v[i - 1] != null && bars.v[i] > bars.v[i - 1];
    out.push({ d: bars.d[i], c: bars.c[i], state, dd: lastDD, isDD, ftd, rallyDay: state === 'CORRECTION' && rally ? rallyDay : 0 });
  }
  return out;
}
/** 이동평균 요약(원본 index_summary 와 같은 항목) */
export function maSummary(bars) {
  const c = bars.c, n = c.length, i = n - 1, m = (k, at = i) => sma(c, at, k);
  const ma20 = m(20), ma60 = m(60), ma120 = m(120), ma20prev = m(20, i - 5);
  const pos = (ma) => (ma == null ? null : c[i] >= ma ? 'above' : 'below');
  return {
    close: c[i], chg: n > 1 ? (c[i] / c[i - 1] - 1) * 100 : null, ma20, ma60, ma120,
    vs20: pos(ma20), vs60: pos(ma60), vs120: pos(ma120),
    trend20: ma20 != null && ma20prev != null ? (ma20 > ma20prev ? 'up' : 'down') : null,
    cross60_120: ma60 != null && ma120 != null ? (ma60 > ma120 ? 'golden' : 'dead') : null,
    chg2w: n > 10 ? (c[i] / c[i - 10] - 1) * 100 : null, high52: Math.max(...c.slice(-250)),
  };
}

/* ───────────── 3. 상대강도 RS ───────────── */
/** IBD 근사식: 2×3개월 + 6개월 + 9개월 + 12개월 수익률 (기록이 252거래일 이하이면 계산하지 않음) */
export function rsRaw(closes) {
  const n = closes.length; if (n <= 252) return null;
  const p0 = closes[n - 1], r = (k) => { const pk = closes[n - 1 - k]; return pk > 0 ? (p0 - pk) / pk : 0; };
  return 2 * r(63) + r(126) + r(189) + r(252);
}
/** 1~99 백분위 */
export function rsRatings(raw) {
  const vals = Object.values(raw).filter((x) => x != null), n = vals.length, out = {};
  if (!n) return out;
  const sorted = [...vals].sort((a, b) => a - b);
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) { out[k] = null; continue; }
    if (n === 1) { out[k] = 50; continue; }
    let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
    out[k] = Math.round(Math.max(1, Math.min(99, (lo / n) * 99)));
  }
  return out;
}
