// 수급 자료 수집 (GitHub Actions에서 평일 장 마감 뒤 실행)
// 출처: 네이버 증권 모바일 API(시가총액 순위·업종·외국인/기관 순매수)와 차트 API(일봉)
// 누적 자료는 암호화한 store.enc.json(별도 data 브랜치)에 보관한다. 사용법: SITE_PASSWORD=... node scripts/collect.mjs [store경로]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { encrypt, decryptNode } from './gate.mjs';

const STORE = process.argv[2] || 'store.enc.json';
const PW = process.env.SITE_PASSWORD;
if (!PW) { console.error('SITE_PASSWORD 가 필요합니다'); process.exit(1); }
const KOSPI_N = +(process.env.KOSPI_N || 200);
const KOSDAQ_N = +(process.env.KOSDAQ_N || 150);
const KEEP = 520;                  // 보관 거래일 수(약 2년)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => { if (s == null) return null; const t = String(s).replace(/[,\s%+]/g, ''); if (t === '' || t === '-') return null; const n = Number(t); return isFinite(n) ? n : null; };

let reqs = 0, fails = 0;
async function get(url, { enc = 'euc-kr', json = false } = {}) {
  for (let t = 0; t < 4; t++) {
    try {
      reqs++;
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = await r.arrayBuffer();
      const text = new TextDecoder(enc).decode(buf);
      return json ? JSON.parse(text) : text;
    } catch (e) { if (t === 3) { fails++; throw e; } await sleep(600 * (t + 1)); }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e.message }; } await sleep(120); } }));
  return out;
}

/* ── 대상 종목 ── (네이버 증권 모바일 API)
   코스피200 구성종목 목록은 공개 주소가 없어져, 코스피 시가총액 상위 보통주 200개로 대신한다. */
const M = 'https://m.stock.naver.com/api';
const isCommon = (x) => x.stockEndType === 'stock' && /^\d{5}0$/.test(x.itemCode);
async function marketTop(market, n) {
  const out = new Map();
  for (let p = 1; out.size < n && p <= 10; p++) {
    const j = await get(`${M}/stocks/marketValue/${market}?page=${p}&pageSize=100`, { enc: 'utf-8', json: true });
    const list = (j.stocks || []).filter(isCommon);
    if (!(j.stocks || []).length) break;
    for (const x of list) { if (out.size >= n) break; out.set(x.itemCode, x.stockName); }
  }
  return out;
}
async function sectors() {
  const j = await get(`${M}/stocks/industry?page=1&pageSize=100`, { enc: 'utf-8', json: true });
  const groups = (j.groups || []).map((g) => ({ no: String(g.no), name: g.name }));
  const map = {}, list = [];
  await pool(groups, 4, async (g) => {
    const members = [];
    for (let p = 1; p <= 10; p++) {
      const r = await get(`${M}/stocks/industry/${g.no}?page=${p}&pageSize=100`, { enc: 'utf-8', json: true });
      const st = r.stocks || [];
      members.push(...st.filter((x) => (x.sosok === '0' || x.sosok === '1') && isCommon(x)));
      if (st.length < 100) break;
    }
    list.push({ no: g.no, name: g.name, members: members.map((m) => m.itemCode), names: Object.fromEntries(members.map((m) => [m.itemCode, m.stockName])) });
    members.forEach((m) => { map[m.itemCode] = g.name; });
  });
  return { map, list: list.filter((g) => g.members.length).sort((a, b) => a.name.localeCompare(b.name, 'ko')) };
}

/* ── 종목별 일봉(OHLCV) ── */
async function ohlcv(code, count) {
  const xml = await get(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`);
  const rows = {};
  for (const m of xml.matchAll(/data="(\d{8})\|([^"]+)"/g)) {
    const [o, h, l, c, v] = m[2].split('|').map(Number);
    if (c > 0) rows[m[1]] = { o, h, l, c, v };
  }
  return rows;
}
/* ── 종목별 외국인·기관 순매수(수량): bizdate 를 커서로 과거로 넘긴다 ── */
async function investors(code, days) {
  const out = {}; let cursor = '';
  for (let k = 0; k < 20 && Object.keys(out).length < days; k++) {
    const arr = await get(`${M}/stock/${code}/trend?pageSize=60${cursor ? '&bizdate=' + cursor : ''}`, { enc: 'utf-8', json: true });
    if (!Array.isArray(arr) || !arr.length) break;
    let fresh = 0;
    for (const x of arr) {
      const d = String(x.bizdate || '').replace(/\D/g, ''); if (d.length !== 8 || out[d]) continue;
      out[d] = { c: num(x.closePrice), v: num(x.accumulatedTradingVolume), org: num(x.organPureBuyQuant), frg: num(x.foreignerPureBuyQuant) }; fresh++;
    }
    if (!fresh || arr.length < 60) break;
    cursor = String(arr.at(-1).bizdate).replace(/\D/g, '');
  }
  return out;
}

/* ── 저장소 ── */
function loadStore() {
  if (!existsSync(STORE)) return { stocks: {} };
  try { return JSON.parse(decryptNode(JSON.parse(readFileSync(STORE, 'utf8')), PW)); }
  catch (e) { console.error('기존 자료를 복호화하지 못했습니다(비밀번호가 바뀌었나요?). 처음부터 다시 받습니다.', e.message); return { stocks: {} }; }
}
const toRows = (rec) => Object.fromEntries((rec?.d || []).map((d, i) => [d, { o: rec.o[i], h: rec.h[i], l: rec.l[i], c: rec.c[i], v: rec.v[i], frg: rec.frg[i], org: rec.org[i] }]));
function fromRows(rows) {
  const d = Object.keys(rows).sort().slice(-KEEP);
  const pick = (k) => d.map((x) => (rows[x][k] ?? null));
  return { d, o: pick('o'), h: pick('h'), l: pick('l'), c: pick('c'), v: pick('v'), frg: pick('frg'), org: pick('org') };
}

(async () => {
  const t0 = Date.now(), store = loadStore();
  console.log(`기존 자료: ${Object.keys(store.stocks).length}종목`);
  const [k2, kq] = await Promise.all([marketTop('KOSPI', KOSPI_N), marketTop('KOSDAQ', KOSDAQ_N)]);
  console.log(`코스피 상위 ${k2.size} · 코스닥 상위 ${kq.size}`);
  if (k2.size < 100) throw new Error('코스피 종목 목록을 충분히 받지 못했습니다');
  let sec = store.sectors;
  try { sec = await sectors(); console.log(`업종 ${sec.list.length}개`); } catch (e) { console.warn('업종 목록 실패, 이전 자료 사용:', e.message); }
  const uni = [...[...k2].map(([code, name]) => ({ code, name, market: 'KOSPI' })), ...[...kq].map(([code, name]) => ({ code, name, market: 'KOSDAQ' }))];

  let ok = 0, probe = true;
  const res = await pool(uni, 4, async (u) => {
    const old = store.stocks[u.code], fresh = !old || old.d.length < 60;
    const rows = toRows(old);
    let px = {}; try { px = await ohlcv(u.code, fresh ? KEEP : 40); } catch (e) { /* 아래 투자자 자료의 종가로 대신 */ }
    let inv = {};
    try { inv = await investors(u.code, fresh ? KEEP : 40); } catch (e) {}
    if (probe && Object.keys(inv).length) { probe = false; const k = Object.keys(inv).sort().at(-1); console.log('표본', u.code, k, JSON.stringify(inv[k]), JSON.stringify(px[k] || {})); }
    for (const [d, p] of Object.entries(px)) rows[d] = { ...(rows[d] || {}), ...p };
    for (const [d, x] of Object.entries(inv)) {
      const r = rows[d] || {};
      rows[d] = { ...r, frg: x.frg ?? r.frg ?? null, org: x.org ?? r.org ?? null, c: r.c ?? x.c, v: r.v ?? x.v, o: r.o ?? x.c, h: r.h ?? x.c, l: r.l ?? x.c };
    }
    if (!Object.keys(rows).length) throw new Error('자료 없음');
    const rec = { code: u.code, name: u.name, market: u.market, sector: sec?.map?.[u.code] || old?.sector || '', ...fromRows(rows) };
    store.stocks[u.code] = rec; ok++;
    return rec.d.length;
  });
  const bad = res.filter((x) => x && x.error).length;
  // 대상에서 빠진 종목은 30거래일 뒤 정리
  const live = new Set(uni.map((u) => u.code));
  for (const [code, rec] of Object.entries(store.stocks)) if (!live.has(code)) { rec.dropped = (rec.dropped || 0) + 1; if (rec.dropped > 30) delete store.stocks[code]; } else delete rec.dropped;
  store.universe = uni; store.sectors = sec; store.updated = new Date().toISOString();
  console.log(`수집 ${ok}/${uni.length} 성공, 실패 ${bad} · 요청 ${reqs}회(실패 ${fails}) · ${Math.round((Date.now() - t0) / 1000)}초`);
  if (ok < uni.length * .6) throw new Error('수집 성공률이 너무 낮아 저장하지 않습니다');
  writeFileSync(STORE, JSON.stringify(encrypt(JSON.stringify(store), PW)));
  console.log('저장:', STORE);
})().catch((e) => { console.error('수집 실패:', e); process.exit(1); });
