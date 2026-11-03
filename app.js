/* 수급 대시보드 — 화면 */
(() => {
'use strict';
const E = window.Engine, LW = window.LightweightCharts;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
const fmt = (n, d = 0) => (n == null || !isFinite(n) ? '-' : Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const eok = (won) => (won == null ? '-' : fmt(won / 1e8, Math.abs(won) >= 1e10 ? 0 : 1));       // 억원
const pct = (x, d = 1) => (x == null || !isFinite(x) ? '-' : (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const ymd = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : '');
const md = (d) => (d ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : '');
const qty = (n) => { if (n == null) return '-'; const a = Math.abs(n); return a >= 1e8 ? fmt(n / 1e8, 2) + '억주' : a >= 1e4 ? fmt(n / 1e4, a >= 1e6 ? 0 : 1) + '만주' : fmt(n) + '주'; };
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }

/* ───── 암호화 자료 읽기 ───── */
const PW_KEY = 'supply-dash.pw';
const pw = (() => { try { return localStorage.getItem(PW_KEY) || sessionStorage.getItem(PW_KEY); } catch (_) { return null; } })();
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const keyCache = {};
async function aesKey(salt, iter) {
  if (!keyCache[salt]) keyCache[salt] = (async () => {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw || ''), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(salt), iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  })();
  return keyCache[salt];
}
async function load(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + (S.built || Date.now()), { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const env = await r.json();
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, await aesKey(env.salt, env.iterations), b64(env.data)));
  if (env.compression === 'gzip') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ───── 상태 ───── */
const S = { sum: null, byCode: {}, code: lsGet('sd.code', null), rec: null, A: null, built: null, cfg: loadCfg(), J: {} };
function loadCfg() { const c = lsGet('sd.cfg', null); const d = JSON.parse(JSON.stringify(E.DEFAULT_CFG)); return c ? { ...d, ...c, req: { ...d.req, ...(c.req || {}) }, trend: { ...d.trend, ...(c.trend || {}) } } : d; }
const VCLS = { 매수진입: 'v-in', 매수대기: 'v-wait', 매수보류: 'v-hold', 매수불가: 'v-no' };
const VRANK = { 매수진입: 0, 매수대기: 1, 매수보류: 2, 매수불가: 3 };
const vtag = (v) => `<span class="tag ${VCLS[v] || 'v-no'}">${v}</span>`;
const STCLS = { '강한 진입': 's-strong', 진입: 's-in', '진입 준비': 's-ready' };
const sttag = (s) => (s ? `<span class="st ${STCLS[s]}">${s}</span>` : '<span class="st">-</span>');
const nm = (s) => `<span class="nm"><b>${esc(s.name)}</b><span>${s.code}</span></span>`;
function rejudge() { S.J = {}; for (const s of S.sum.stocks) S.J[s.code] = E.judge(s, S.cfg); }

/* ───── 탭 ───── */
const TABS = ['market', 'judge', 'streak', 'sector', 'chart', 'table', 'force', 'list', 'sim'];
let tab = 'market';
function go(t, keepScroll) {
  if (!TABS.includes(t)) t = 'market';
  tab = t;
  $$('[data-tab]').forEach((el) => (el.hidden = el.dataset.tab !== t));
  $('#hero').hidden = !$('#hero').dataset.tabs.split(' ').includes(t) || !S.rec;
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.go === t));
  if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t);
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const row = e.target.closest('[data-code]'); if (row) { e.preventDefault(); openStock(row.dataset.code, row.dataset.to || 'judge'); }
});
function segInit(id, fn) { $('#' + id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset.v); }); }
const segVal = (id) => $(`#${id} button.on`)?.dataset.v;

/* ───── 종목 선택 ───── */
async function openStock(code, to) {
  if (!S.byCode[code]) { toast('분석 중인 종목이 아닙니다'); return; }
  S.code = code; lsSet('sd.code', code);
  $('#pickerName').textContent = S.byCode[code].name;
  try { S.rec = await load(`data/s/${code}.json`); S.A = E.analyze(S.rec); } catch (e) { toast('종목 자료를 불러오지 못했습니다'); S.rec = null; }
  go(to || tab);
}
$('#picker').addEventListener('click', () => { $('#sheet').hidden = false; $('#sheetQ').value = ''; sheetList(''); $('#sheetQ').focus(); });
$('#sheetClose').addEventListener('click', () => ($('#sheet').hidden = true));
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').hidden = true; });
$('#sheetQ').addEventListener('input', (e) => sheetList(e.target.value));
function matchQ(s, q) { q = q.trim().toLowerCase(); return !q || s.name.toLowerCase().includes(q) || s.code.includes(q); }
function sheetList(q) {
  const list = S.sum.stocks.filter((s) => matchQ(s, q)).sort((a, b) => VRANK[S.J[a.code].verdict] - VRANK[S.J[b.code].verdict] || b.amt20 - a.amt20).slice(0, 80);
  $('#sheetList').innerHTML = list.map((s) => `<button type="button" data-code="${s.code}" data-to="${['judge', 'chart', 'table', 'force'].includes(tab) ? tab : 'judge'}"><span>${nm(s)} <small>${s.market}</small></span>${vtag(S.J[s.code].verdict)}</button>`).join('') || '<p class="gate-msg">찾는 종목이 없습니다</p>';
}
document.addEventListener('click', (e) => { if (e.target.closest('#sheetList [data-code]')) $('#sheet').hidden = true; });

/* ───── 렌더 ───── */
function render() {
  if (!S.sum) return;
  const R = { market: rMarket, judge: rJudge, streak: rStreak, sector: rSector, chart: rChart, table: rTable, force: rForce, list: rList, sim: rSim }[tab];
  if (['judge', 'chart', 'table', 'force'].includes(tab)) { if (!S.rec) { $$(`[data-tab="${tab}"]`).forEach((el) => { if (!el.querySelector('.gate-msg')) el.insertAdjacentHTML('afterbegin', '<p class="gate-msg">위의 「종목 선택」에서 종목을 고르세요.</p>'); }); return; } rHero(); }
  R();
}
function rHero() {
  const s = S.byCode[S.code], j = S.J[S.code];
  $('#hero').innerHTML = `<div><div class="h-name">${esc(s.name)}<span>${s.code} · ${s.market}${s.sector ? ' · ' + esc(s.sector) : ''}</span></div>
    <div class="h-px">${fmt(s.c)}원 <span class="${cls(s.chg)}">${pct(s.chg, 2)}</span> · 20일 <span class="${cls(s.ret20)}">${pct(s.ret20)}</span> · ${sttag(s.strength)}${s.streak ? ` <small>${s.streak}일째</small>` : ''}</div></div>
    <div class="h-verdict">${vtag(j.verdict)}</div>
    <div class="h-reason">${esc(j.reason)} · 기준일 ${ymd(s.date)}</div>`;
  $$('[data-tab] .gate-msg').forEach((el) => el.remove());
}

/* 시장 */
function rMarket() {
  const st = S.sum.stocks, m = S.sum.market, L = m.dates.length - 1;
  $('#mkDate').textContent = ymd(S.sum.date) + ` · ${S.sum.n}종목`;
  const sumK = (arr, k) => arr.slice(-k).reduce((a, b) => a + b, 0);
  const rows = [['외국인', m.frg], ['기관계', m.org], ['세력합', m.frg.map((x, i) => x + m.org[i])]];
  $('#mkSum').innerHTML = `<table class="tbl num"><tr><th>주체 (억원)</th><th>당일</th><th>5일</th><th>20일</th></tr>${rows.map(([n, a]) => `<tr><td>${n}</td>${[1, 5, 20].map((k) => `<td class="${cls(sumK(a, k))}">${eok(sumK(a, k))}</td>`).join('')}</tr>`).join('')}</table>
    <div class="kpi-row" style="margin-top:12px"><div class="kpi"><div class="k">매수진입</div><div class="v" style="color:var(--v-in)">${st.filter((s) => S.J[s.code].verdict === '매수진입').length}</div></div><div class="kpi"><div class="k">강한 진입</div><div class="v up">${st.filter((s) => s.strength === '강한 진입').length}</div></div><div class="kpi"><div class="k">5일 연속</div><div class="v">${st.filter((s) => s.streak >= 5).length}</div></div></div>`;
  // 누적 차트
  const D = m.dates.slice(-60), cum = (a) => { let s = 0; return a.slice(-60).map((x) => (s += x) / 1e8); };
  lineChart('#mkAccChart', D, [['외국인', cum(m.frg), '#d32f2f'], ['기관계', cum(m.org), '#1565c0'], ['세력합', cum(m.frg.map((x, i) => x + m.org[i])), '#008254']], (v) => fmt(v) + '억');
  rTop();
  const sec = [...S.sum.sectors].filter((g) => g.n);
  const secRow = (g) => `<tr class="go" data-sec="${esc(g.name)}"><td>${esc(g.name)}</td><td class="r ${cls(g.net5)}">${eok(g.net5)}</td></tr>`;
  $('#secBuy').innerHTML = sec.sort((a, b) => b.net5 - a.net5).slice(0, 7).map(secRow).join('');
  $('#secSell').innerHTML = sec.filter((g) => g.net5 < 0).sort((a, b) => a.net5 - b.net5).slice(0, 7).map(secRow).join('') || '<tr><td class="empty">순매도 업종이 없습니다</td></tr>';
  $('#secBuy').innerHTML = sec.filter((g) => g.net5 > 0).sort((a, b) => b.net5 - a.net5).slice(0, 7).map(secRow).join('') || '<tr><td class="empty">순매수 업종이 없습니다</td></tr>';
  const lu = (S.sum.hist[S.sum.date] || {}).limitup || [];
  $('#mkLimit').innerHTML = lu.length ? `<tr><th>종목</th><th class="r">종가</th><th class="r">상승</th><th>종합 판단</th></tr>` + lu.map(([c, px, ch]) => S.byCode[c] ? `<tr class="go" data-code="${c}"><td>${nm(S.byCode[c])}</td><td class="r">${fmt(px)}</td><td class="r up">${pct(ch)}</td><td>${vtag(S.J[c].verdict)}</td></tr>` : '').join('') : '<tr><td class="empty">오늘 상한가로 마감한 분석 종목이 없습니다</td></tr>';
}
function rTop() {
  const k = segVal('topPeriod'), w = segVal('topWho');
  const val = (s) => { const f = s['f' + k], o = s['o' + k]; return w === 'f' ? f : w === 'o' ? o : f + o; };
  const st = S.sum.stocks.map((s) => [s, val(s)]);
  const row = ([s, v]) => `<tr class="go" data-code="${s.code}"><td>${nm(s)}</td><td class="r ${cls(v)}">${eok(v)}억</td><td>${vtag(S.J[s.code].verdict)}</td></tr>`;
  $('#topBuy').innerHTML = st.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(row).join('') || '<tr><td class="empty">없음</td></tr>';
  $('#topSell').innerHTML = st.filter((x) => x[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 10).map(row).join('') || '<tr><td class="empty">없음</td></tr>';
}
segInit('topPeriod', rTop); segInit('topWho', rTop);
document.addEventListener('click', (e) => { const r = e.target.closest('[data-sec]'); if (r) { S.sec = r.dataset.sec; go('sector'); setTimeout(() => $('#slTitle').scrollIntoView({ behavior: 'smooth' }), 50); } });

/* 판단 */
function rJudge() {
  const s = S.byCode[S.code], j = S.J[S.code], cfg = S.cfg;
  const req = Object.entries(cfg.req).filter(([, v]) => v).map(([k]) => k);
  const st = (ok, txt) => `<span class="${ok == null ? 'unk' : ok ? 'pass' : 'fail'}">${ok == null ? '미확인' : ok ? txt || '통과' : '미통과'}</span>`;
  const trendReq = cfg.trend.strong || cfg.trend.rebound;
  const trendOk = (!cfg.trend.strong || s.trendStrong) && (!cfg.trend.rebound || s.ck.rebound);
  $('#basis').innerHTML = [
    ['① 수급 후보', st(j.cand, '후보'), `켜진 신호 ${j.k}개 / 기준 ${cfg.minSignals}개 · 후보 강도 ${s.strength || '없음'}`],
    ['② 진입 확인', j.cand ? st(!j.fails.length) : '<span class="unk">-</span>', req.length ? `필수 ${req.length}개 중 ${req.length - j.fails.length}개 통과` + (j.fails.length ? ' · 미통과: ' + j.fails.map((f) => E.CHECKS.find((x) => x[0] === f)[1].split(' (')[0]).join(', ') : '') : '필수 조건 없음'],
    ['③ 추세 확인', trendReq ? st(trendOk) : '<span class="unk">사용 안 함</span>', trendReq ? [cfg.trend.strong && `추세 강세 ${s.trendStrong ? '확인' : '미확인'}`, cfg.trend.rebound && `오늘 반등 ${s.ck.rebound ? '확인' : '미확인'}`].filter(Boolean).join(' · ') : '기준선 설정에서 켤 수 있습니다'],
    ['④ 분석 보고서', '<span class="unk">미반영</span>', '보고서 기능은 이 사이트에 없어 수급 규칙만으로 판단합니다'],
  ].map(([a, b, c]) => `<div class="basis-row"><b>${a}</b>${b}<span>${c}</span></div>`).join('') + `<div class="basis-row"><b>종합 판단</b>${vtag(j.verdict)}<span>${esc(j.reason)}</span></div>`;
  rCfg();
  const i = S.rec.d.length - 1, A = S.A;
  const sigDesc = ['세력 매집이 이어지는 중(매집 5일선>20일선, 분산비 0.8 이상)인데 가격은 직전 5일 고점보다 3% 이상 눌리고 20일선 근처 이상', '매집 간격이 과거 양(+) 간격의 상위 25% 선을 넘음', '최근 5일 안에 20일 평균의 2.5배 이상 거래 + 양봉 + 세력 순매수'];
  $('#sigTable').innerHTML = `<tr><th>신호</th><th>오늘</th><th>설명</th></tr>` + E.SIG_NAMES.map((n, k) => `<tr><td><b>${'①②③'[k]} ${n}</b></td><td>${s.sig[k] ? '<span class="pass">켜짐</span>' : '<span class="unk">꺼짐</span>'}</td><td class="note" style="margin:0">${sigDesc[k]}</td></tr>`).join('')
    + `<tr><td>확인 · 분산비</td><td>${(A.F.ratio[i] || 0).toFixed(2)}</td><td class="note">1에 가까울수록 매집이 최고 수준</td></tr><tr><td>확인 · 5일 세력 순매수</td><td class="${cls(s.ckVal.net5)}">${qty(s.ckVal.net5)}</td><td class="note">외국인+기관 최근 5거래일 합</td></tr>`;
  const vals = { rebound: '', flow5: qty(s.ckVal.net5), days5: s.ckVal.days5 + '일', chase: pct(s.chg), rr: s.ckVal.rr == null ? '-' : s.ckVal.rr.toFixed(2), liquidity: eok(s.ckVal.amt20) + '억' };
  $('#ckTable').innerHTML = `<tr><th>조건</th><th>값</th><th>결과</th></tr>` + E.CHECKS.map(([k, l]) => `<tr><td>${l}${cfg.req[k] ? '<span class="req">필수</span>' : ''}</td><td class="r">${vals[k]}</td><td>${st(s.ck[k])}</td></tr>`).join('');
  const P = A.perf;
  $('#perfTable').innerHTML = `<tr><th>신호</th><th class="r">횟수</th><th class="r">20일 뒤 상승</th><th class="r">평균 수익</th><th class="r">최근</th></tr>` + [['①' + E.SIG_NAMES[0], P.s1], ['②' + E.SIG_NAMES[1], P.s2], ['③' + E.SIG_NAMES[2], P.s3], ['강한 진입', P.strong]].map(([n, p]) => `<tr><td>${n}</td><td class="r">${p.n}</td><td class="r">${p.win == null ? '-' : (p.win * 100).toFixed(0) + '%'}</td><td class="r ${cls(p.avg)}">${pct(p.avg)}</td><td class="r">${p.last ? ymd(p.last) : '-'}</td></tr>`).join('');
}
function rCfg() {
  const c = S.cfg;
  $('#cfgBox').innerHTML = `<div class="cfg-in">
    <label>① 수급 후보: 켜진 신호가 <select data-cfg="minSignals">${[1, 2, 3].map((n) => `<option${c.minSignals === n ? ' selected' : ''}>${n}</option>`).join('')}</select> 개 이상이면 후보</label>
    <h4>② 진입 확인에서 반드시 통과해야 하는 조건</h4>
    ${E.CHECKS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-req="${k}"${c.req[k] ? ' checked' : ''}> ${l}</label>`).join('')}
    <h4>③ 추세 확인</h4>
    <label class="chk"><input type="checkbox" data-trend="strong"${c.trend.strong ? ' checked' : ''}> 추세 강세 필요: 종가가 20일선보다 8.5% 이상 위 & 세력 5일 순매수 금액이 20일 평균 거래대금의 2.5% 이하</label>
    <label class="chk"><input type="checkbox" data-trend="rebound"${c.trend.rebound ? ' checked' : ''}> 오늘 반등 확인 필요: 종가가 직전 3거래일 최고 종가를 돌파</label>
    <label class="chk"><input type="checkbox" data-cfg="unknownPass"${c.unknownPass ? ' checked' : ''}> 미확인 조건은 통과로 봄</label>
    <div><button type="button" class="btn" id="cfgReset">기본값으로 되돌리기</button></div>
    <p class="note">기본값은 검증용 초기값이며 최적값이 아닙니다. 설정은 이 브라우저에만 저장됩니다. 신호 계산은 그대로이고, 어디까지를 통과로 볼지만 바뀝니다.</p></div>`;
}
$('#cfgBox').addEventListener('change', (e) => {
  const el = e.target, c = S.cfg;
  if (el.dataset.req) c.req[el.dataset.req] = el.checked;
  else if (el.dataset.trend) c.trend[el.dataset.trend] = el.checked;
  else if (el.dataset.cfg === 'minSignals') c.minSignals = +el.value;
  else if (el.dataset.cfg === 'unknownPass') c.unknownPass = el.checked;
  lsSet('sd.cfg', c); rejudge(); rHero(); rJudge(); $('#cfgBox').closest('details').open = true;
});
$('#cfgBox').addEventListener('click', (e) => { if (e.target.id === 'cfgReset') { S.cfg = JSON.parse(JSON.stringify(E.DEFAULT_CFG)); lsSet('sd.cfg', S.cfg); rejudge(); rHero(); rJudge(); $('#cfgBox').closest('details').open = true; toast('기본값으로 되돌렸습니다'); } });

/* 강한진입 */
function rStreak() {
  const H = S.sum.hist, dates = Object.keys(H).sort().reverse();
  const opt = (sel, cur) => { if (!sel.options.length) sel.innerHTML = dates.map((d) => `<option value="${d}">${ymd(d)}${d === S.sum.date ? ' (최신)' : ''}</option>`).join(''); if (cur) sel.value = cur; };
  opt($('#luDate')); opt($('#stDate'));
  const lu = (H[$('#luDate').value] || {}).limitup || [];
  $('#luTable').innerHTML = lu.length ? `<tr><th>종목</th><th class="r">종가</th><th class="r">당일</th><th>그날 수급 후보</th><th>오늘 판단</th><th class="r hide-m">20일</th></tr>` + lu.map(([c, px, ch, stg]) => { const s = S.byCode[c]; return s ? `<tr class="go" data-code="${c}"><td>${nm(s)}</td><td class="r">${fmt(px)}</td><td class="r up">${pct(ch)}</td><td>${sttag(stg)}</td><td>${vtag(S.J[c].verdict)}</td><td class="r hide-m ${cls(s.ret20)}">${pct(s.ret20)}</td></tr>` : ''; }).join('') : '<tr><td class="empty">이날 상한가로 마감한 분석 종목이 없습니다</td></tr>';
  // 종합 판단별
  const f = segVal('jFilter'), only3 = $('#jStreak3').checked;
  const jl = S.sum.stocks.filter((s) => S.J[s.code].verdict === f && (!only3 || s.streak >= 3)).sort((a, b) => b.streak - a.streak || b.sig.filter(Boolean).length - a.sig.filter(Boolean).length || b.amt20 - a.amt20);
  $('#jTable').innerHTML = jl.length ? `<tr><th>종목</th><th>판단</th><th>수급 후보</th><th class="hide-m">진입 확인</th><th class="r">20일</th><th class="r">연속</th></tr>` + jl.slice(0, 150).map((s) => { const j = S.J[s.code]; return `<tr class="go" data-code="${s.code}"><td>${nm(s)}</td><td>${vtag(j.verdict)}</td><td>${sttag(s.strength)}</td><td class="hide-m note">${j.fails && j.fails.length ? '미통과 ' + j.fails.length : j.cand ? '통과' : '-'}</td><td class="r ${cls(s.ret20)}">${pct(s.ret20)}</td><td class="r">${s.streak || '-'}</td></tr>`; }).join('') + (jl.length > 150 ? `<tr><td class="empty" colspan="6">외 ${jl.length - 150}종목</td></tr>` : '') : '<tr><td class="empty">해당 종목이 없습니다</td></tr>';
  // 연속
  const d = $('#stDate').value, latest = d === S.sum.date;
  const list = (H[d] || {}).strong || [];
  const enrich = list.map(([c, k]) => ({ s: S.byCode[c], k })).filter((x) => x.s);
  const bad = (x) => x.s.past.n >= 5 && (x.s.past.win < .5 || x.s.past.avg < 0);
  const row = (x) => { const s = x.s, p = s.past; return `<tr class="go" data-code="${s.code}"><td>${nm(s)}</td><td class="r">${x.k}일</td><td class="r">${p.n < 5 ? '표본 적음' : (p.win * 100).toFixed(0) + '%'}</td><td class="r ${cls(p.avg)}">${p.n ? pct(p.avg) : '-'}</td><td>${latest ? vtag(S.J[s.code].verdict) : '<span class="note">-</span>'}</td><td class="r hide-m">${latest && s.startClose ? `<span class="${cls(s.c / s.startClose - 1)}">${pct(s.c / s.startClose - 1)}</span>` : '-'}</td></tr>`; };
  const head = `<tr><th>종목</th><th class="r">연속</th><th class="r">과거 승률</th><th class="r">과거 평균</th><th>진입 상태</th><th class="r hide-m">시작일 대비</th></tr>`;
  const t5 = enrich.filter((x) => x.k >= 5 && !bad(x)).sort((a, b) => b.k - a.k), t34 = enrich.filter((x) => x.k >= 3 && x.k <= 4 && !bad(x)).sort((a, b) => b.k - a.k), tb = enrich.filter((x) => x.k >= 3 && bad(x));
  $('#st5').innerHTML = t5.length ? head + t5.map(row).join('') : '<tr><td class="empty">5거래일 이상 이어진 종목이 없습니다</td></tr>';
  $('#st34').innerHTML = t34.length ? head + t34.map(row).join('') : '<tr><td class="empty">없음</td></tr>';
  $('#stBad').innerHTML = tb.length ? head + tb.map(row).join('') : '<tr><td class="empty">없음</td></tr>';
}
segInit('jFilter', rStreak);
['luDate', 'stDate', 'jStreak3'].forEach((id) => $('#' + id).addEventListener('change', rStreak));

/* 업종 */
function spark(cv, g) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth || 200, h = 64; cv.width = w * dpr; cv.height = h * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const all = [...g.acc, ...g.ma5, ...g.ma20].filter((v) => v != null), lo = Math.min(...all), hi = Math.max(...all) || 1, n = g.acc.length;
  const X = (i) => (i / (n - 1)) * w, Y = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  x.beginPath(); x.moveTo(0, h); g.acc.forEach((v, i) => x.lineTo(X(i), Y(v))); x.lineTo(w, h); x.closePath(); x.fillStyle = '#e3e6ea'; x.fill();
  for (const [arr, col] of [[g.ma20, '#ef7d22'], [g.ma5, '#008254']]) { x.beginPath(); let st = false; arr.forEach((v, i) => { if (v == null) return; st ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); st = true; }); x.strokeStyle = col; x.lineWidth = 1.5; x.stroke(); }
}
function rSector() {
  const secs = S.sum.sectors.filter((g) => g.n);
  const mode = segVal('secMode');
  const list = mode === 'strong' ? [...secs].filter((g) => g.up).sort((a, b) => b.net20 - a.net20).slice(0, 12) : [...secs].sort((a, b) => b.net20 - a.net20);
  $('#sparkGrid').innerHTML = list.map((g) => `<div class="spark" data-sec="${esc(g.name)}"><div class="sp-h"><b>${esc(g.name)}</b><span class="${cls(g.net20)}">${eok(g.net20)}억</span></div><canvas></canvas></div>`).join('') || '<p class="note">매집이 이어지는 업종이 없습니다</p>';
  $$('#sparkGrid .spark').forEach((el, i) => spark(el.querySelector('canvas'), list[i]));
  const all = [...S.sum.sectors].sort((a, b) => b.net20 - a.net20);
  $('#secTable').innerHTML = `<tr><th>업종</th><th class="r">전체 종목</th><th class="r">분석 중</th><th>매집 상태</th><th class="r">20일 세력(억)</th></tr>` + all.map((g) => `<tr class="go" data-sec="${esc(g.name)}"><td>${esc(g.name)}</td><td class="r">${g.members.length}</td><td class="r">${g.n}</td><td>${g.n ? (g.up ? '<span class="pass">매집 중</span>' : '<span class="unk">약화</span>') : '-'}</td><td class="r ${cls(g.net20)}">${g.n ? eok(g.net20) : '-'}</td></tr>`).join('');
  const g = S.sum.sectors.find((x) => x.name === S.sec) || all[0];
  if (!g) return;
  $('#slTitle').textContent = `${g.name} 구성 종목`;
  const mem = g.members.map((c) => S.byCode[c] ? { s: S.byCode[c], v: S.byCode[c].f20 + S.byCode[c].o20 } : { c, name: g.names[c] });
  const an = mem.filter((x) => x.s).sort((a, b) => b.v - a.v), tot = an.filter((x) => x.v > 0).reduce((s, x) => s + x.v, 0);
  $('#slTable').innerHTML = `<tr><th class="r">주도</th><th>종목</th><th>상태</th><th class="r">20일 세력(억)</th><th class="r hide-m">비중</th><th class="r">현재가</th><th class="r">20일</th></tr>` + an.map((x, i) => `<tr class="go" data-code="${x.s.code}"><td class="r">${i + 1}</td><td>${nm(x.s)}</td><td>${vtag(S.J[x.s.code].verdict)}</td><td class="r ${cls(x.v)}">${eok(x.v)}</td><td class="r hide-m">${x.v > 0 && tot ? ((x.v / tot) * 100).toFixed(0) + '%' : '-'}</td><td class="r">${fmt(x.s.c)}</td><td class="r ${cls(x.s.ret20)}">${pct(x.s.ret20)}</td></tr>`).join('') + mem.filter((x) => !x.s).map((x) => `<tr><td class="r">-</td><td><span class="nm"><b>${esc(x.name)}</b><span>${x.c}</span></span></td><td colspan="5" class="note">분석 대상 아님</td></tr>`).join('');
}
segInit('secMode', rSector);

/* 차트 공통 */
const charts = {};
function newChart(sel, opt = {}) {
  const el = $(sel); if (charts[sel]) { charts[sel].remove(); delete charts[sel]; }
  el.innerHTML = '';
  const ch = LW.createChart(el, Object.assign({ autoSize: true, layout: { background: { color: '#ffffff' }, textColor: '#6b7280', fontFamily: 'Montserrat, Noto Sans KR, sans-serif', fontSize: 11 }, grid: { vertLines: { color: '#f1f3f5' }, horzLines: { color: '#f1f3f5' } }, rightPriceScale: { borderColor: '#e3e6ea' }, timeScale: { borderColor: '#e3e6ea' }, crosshair: { mode: 0 }, localization: { locale: 'ko-KR' } }, opt));
  charts[sel] = ch; return ch;
}
const ser = (d, arr) => d.map((t, i) => (arr[i] == null || !isFinite(arr[i]) ? { time: ymd(t) } : { time: ymd(t), value: arr[i] }));
function lineChart(sel, d, lines, f) {
  const ch = newChart(sel, { localization: { locale: 'ko-KR', priceFormatter: f } });
  lines.forEach(([title, arr, color, o]) => ch.addLineSeries(Object.assign({ color, lineWidth: 2, title, priceLineVisible: false, lastValueVisible: true }, o || {})).setData(ser(d, arr)));
  ch.timeScale().fitContent(); return ch;
}
function rChart() {
  const r = S.rec, A = S.A, n = r.d.length, from = Math.max(0, n - 250), D = r.d.slice(from), sl = (a) => a.slice(from);
  const pc = newChart('#chPrice');
  const cs = pc.addCandlestickSeries({ priceFormat: { type: 'price', precision: 0, minMove: 1 }, upColor: '#d32f2f', downColor: '#1565c0', borderUpColor: '#d32f2f', borderDownColor: '#1565c0', wickUpColor: '#d32f2f', wickDownColor: '#1565c0', priceLineVisible: false });
  cs.setData(D.map((t, k) => { const i = from + k; return { time: ymd(t), open: r.o[i] || r.c[i], high: r.h[i] || r.c[i], low: r.l[i] || r.c[i], close: r.c[i] }; }));
  pc.addLineSeries({ priceFormat: { type: 'price', precision: 0, minMove: 1 }, color: '#ef7d22', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, title: '20일선' }).setData(ser(D, sl(A.pma20)));
  const marks = []; for (let i = from; i < n; i++) if (A.strength[i] === '강한 진입' && A.strength[i - 1] !== '강한 진입') marks.push({ time: ymd(r.d[i]), position: 'belowBar', color: '#008254', shape: 'arrowUp', text: '강한 진입' });
  cs.setMarkers(marks);
  const vs = pc.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false });
  pc.priceScale('vol').applyOptions({ scaleMargins: { top: .82, bottom: 0 } });
  vs.setData(D.map((t, k) => ({ time: ymd(t), value: r.v[from + k] || 0, color: r.c[from + k] >= (r.c[from + k - 1] || 0) ? 'rgba(211,47,47,.35)' : 'rgba(21,101,192,.35)' })));
  pc.timeScale().fitContent();
  const ac = newChart('#chAcc', { localization: { locale: 'ko-KR', priceFormatter: qty } });
  ac.addAreaSeries({ lineColor: '#9aa1ac', topColor: 'rgba(154,161,172,.35)', bottomColor: 'rgba(154,161,172,.05)', lineWidth: 1, title: '매집수량', priceLineVisible: false }).setData(ser(D, sl(A.F.acc)));
  ac.addLineSeries({ color: '#008254', lineWidth: 2, title: '5일선', priceLineVisible: false }).setData(ser(D, sl(A.F.ma5)));
  ac.addLineSeries({ color: '#ef7d22', lineWidth: 2, title: '20일선', priceLineVisible: false }).setData(ser(D, sl(A.F.ma20)));
  ac.timeScale().fitContent();
  const gc = newChart('#chGap', { localization: { locale: 'ko-KR', priceFormatter: (v) => v.toFixed(2) } });
  const gs = gc.addLineSeries({ color: '#008254', lineWidth: 2, title: '간격', priceLineVisible: false }); gs.setData(ser(D, sl(A.gapN)));
  gc.addLineSeries({ color: '#ef7d22', lineWidth: 1, lineStyle: 2, title: '기준', priceLineVisible: false, lastValueVisible: false }).setData(ser(D, sl(A.thr)));
  const cm = []; for (let i = from; i < n; i++) if (A.cross[i]) cm.push({ time: ymd(r.d[i]), position: 'inBar', color: '#d32f2f', shape: 'circle', size: .6 });
  gs.setMarkers(cm); gc.timeScale().fitContent();
  const rc = newChart('#chRatio', { localization: { locale: 'ko-KR', priceFormatter: (v) => v.toFixed(2) } });
  rc.addAreaSeries({ lineColor: '#008254', topColor: 'rgba(0,130,84,.25)', bottomColor: 'rgba(0,130,84,.02)', lineWidth: 2, title: '분산비', priceLineVisible: false }).setData(ser(D, sl(A.F.ratio)));
  rc.timeScale().fitContent();
}

/* 표 */
function costBasis(net, c) {
  let pos = 0, cost = 0;
  for (let i = 0; i < net.length; i++) {
    const q = net[i] || 0; if (!c[i]) continue;
    if (q > 0) { pos += q; cost += q * c[i]; } else if (q < 0 && pos > 0) { const keep = Math.max(0, pos + q) / pos; pos *= keep; cost *= keep; }
  }
  return { pos, avg: pos > 0 ? cost / pos : null };
}
function rTable() {
  const r = S.rec, A = S.A, n = r.d.length, U = +segVal('tUnit'), mode = segVal('tMode');
  const subj = [['외국인', r.frg], ['기관계', r.org], ['세력합', A.net]];
  let h = `<tr><th>구간</th><th>평균가</th><th>거래량</th>${subj.map(([s]) => `<th>${s}</th>`).join('')}</tr>`;
  for (let k = 0; k < 12; k++) {
    const to = n - 1 - k * U, fr = to - U + 1; if (fr < 0) break;
    let pv = 0, vv = 0; for (let i = fr; i <= to; i++) { pv += (r.c[i] || 0) * (r.v[i] || 0); vv += r.v[i] || 0; }
    const cells = subj.map(([, a]) => {
      if (mode === 'q') { let s = 0; for (let i = fr; i <= to; i++) s += a[i] || 0; return `<td class="${cls(s)}">${qty(s)}</td>`; }
      let q = 0, m = 0; for (let i = fr; i <= to; i++) if ((a[i] || 0) > 0) { q += a[i]; m += a[i] * r.c[i]; } return `<td>${q ? fmt(m / q) : '-'}</td>`;
    }).join('');
    h += `<tr><td>${md(r.d[fr])}~${md(r.d[to])}</td><td>${vv ? fmt(pv / vv) : '-'}</td><td>${qty(vv)}</td>${cells}</tr>`;
  }
  $('#periodTable').innerHTML = h;
  const last = r.c[n - 1];
  $('#costTable').innerHTML = `<tr><th>투자자</th><th>매수평단</th><th>수익률</th><th>매집수량</th></tr>` + subj.map(([s, a]) => { const b = costBasis(a, r.c); return `<tr><td>${s}</td><td>${b.avg ? fmt(b.avg) : '-'}</td><td class="${b.avg ? cls(last / b.avg - 1) : ''}">${b.avg ? pct(last / b.avg - 1) : '-'}</td><td>${qty(b.pos)}</td></tr>`; }).join('');
}
segInit('tUnit', rTable); segInit('tMode', rTable);

/* 세력 */
function rForce() {
  const r = S.rec, A = S.A, n = r.d.length, c = r.c;
  // 최근 1년 안에서 가장 크게 오른 구간(저점→60일 안 고점, 15% 이상)
  let best = null;
  for (let i = Math.max(20, n - 250); i < n - 5; i++) {
    let hi = i; for (let j = i + 1; j <= Math.min(n - 1, i + 60); j++) if (c[j] > c[hi]) hi = j;
    const g = c[hi] / c[i] - 1;
    if (g >= .15 && (!best || g > best.g)) best = { lo: i, hi, g };
  }
  if (!best) $('#whoBox').innerHTML = '<p class="note">최근 1년 안에 15% 이상 오른 구간이 없어 비교하지 않습니다.</p>';
  else {
    const fr = Math.max(0, best.lo - 20), sumR = (a) => { let s = 0; for (let i = fr; i <= best.lo; i++) s += a[i] || 0; return s; };
    const vals = [['외국인', sumR(r.frg)], ['기관계', sumR(r.org)]], top = vals.slice().sort((a, b) => b[1] - a[1])[0];
    $('#whoBox').innerHTML = `<p>${ymd(r.d[best.lo])} 저점에서 ${ymd(r.d[best.hi])}까지 <b class="up">${pct(best.g)}</b> 올랐습니다. 오르기 전 20거래일 동안 ${top[1] > 0 ? `가장 많이 산 주체는 <b>${top[0]}</b>(${qty(top[1])})입니다.` : '외국인·기관 모두 순매도였습니다.'}</p>
      <table class="tbl num"><tr><th>주체</th><th>상승 전 20일 순매수</th><th>상승 구간 순매수</th></tr>${[['외국인', r.frg], ['기관계', r.org], ['세력합', A.net]].map(([s, a]) => { let x = 0, y = 0; for (let i = fr; i <= best.lo; i++) x += a[i] || 0; for (let i = best.lo + 1; i <= best.hi; i++) y += a[i] || 0; return `<tr><td>${s}</td><td class="${cls(x)}">${qty(x)}</td><td class="${cls(y)}">${qty(y)}</td></tr>`; }).join('')}</table>`;
  }
  const from = Math.max(0, n - 60), D = r.d.slice(from), cum = (a) => { let s = 0; return a.slice(from).map((x) => (s += x || 0)); };
  lineChart('#chForce', D, [['외국인', cum(r.frg), '#d32f2f'], ['기관계', cum(r.org), '#1565c0'], ['세력합', cum(A.net), '#008254']], qty);
  const rows = [['외국인', r.frg, A.FR], ['기관계', r.org, A.OR], ['세력합', A.net, A.F]];
  const sumK = (a, k) => a.slice(-k).reduce((s, x) => s + (x || 0), 0);
  $('#forceTable').innerHTML = `<tr><th>세력</th><th>5일</th><th>20일</th><th>분산비</th><th>상태</th></tr>` + rows.map(([s, a, F]) => { const L = n - 1, up = F.ma5[L] != null && F.ma5[L] > F.ma20[L]; return `<tr><td>${s}</td><td class="${cls(sumK(a, 5))}">${qty(sumK(a, 5))}</td><td class="${cls(sumK(a, 20))}">${qty(sumK(a, 20))}</td><td>${(F.ratio[L] || 0).toFixed(2)}</td><td>${up ? '<span class="pass">매집 중</span>' : '<span class="unk">이탈·약화</span>'}</td></tr>`; }).join('');
}

/* 목록 */
function rList() {
  const sel = $('#qSector'); if (sel.options.length < 2) sel.innerHTML += [...new Set(S.sum.stocks.map((s) => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')).map((x) => `<option>${esc(x)}</option>`).join('');
  const q = $('#q').value, m = $('#qMarket').value, sc = sel.value;
  const res = S.sum.stocks.filter((s) => matchQ(s, q) && (!m || s.market === m) && (!sc || s.sector === sc));
  $('#qTable').innerHTML = (q || m || sc) ? (res.length ? `<tr><th>종목</th><th>시장 · 업종</th><th>상태</th></tr>` + res.slice(0, 60).map((s) => `<tr class="go" data-code="${s.code}"><td>${nm(s)}</td><td class="note">${s.market} · ${esc(s.sector || '-')}</td><td>${vtag(S.J[s.code].verdict)}</td></tr>`).join('') : '<tr><td class="empty">찾는 종목이 분석 대상에 없습니다(코스피 시가총액 상위 200 + 코스닥 상위 150)</td></tr>') : '';
  const all = [...S.sum.stocks].sort((a, b) => VRANK[S.J[a.code].verdict] - VRANK[S.J[b.code].verdict] || (b.strength ? 1 : 0) - (a.strength ? 1 : 0) || b.sig.filter(Boolean).length - a.sig.filter(Boolean).length || b.amt20 - a.amt20);
  $('#rankTable').innerHTML = `<tr><th>종목</th><th>판단</th><th class="r">20일</th><th>핵심 세력</th></tr>` + all.map((s) => { const k = Math.abs(s.f20) >= Math.abs(s.o20) ? ['외국인', s.f20] : ['기관', s.o20]; return `<tr class="go" data-code="${s.code}"><td>${nm(s)}</td><td>${vtag(S.J[s.code].verdict)} ${s.strength ? sttag(s.strength) : ''}</td><td class="r ${cls(s.ret20)}">${pct(s.ret20)}</td><td class="note">${k[0]} <span class="${cls(k[1])}">${eok(k[1])}억</span></td></tr>`; }).join('');
}
['q', 'qMarket', 'qSector'].forEach((id) => $('#' + id).addEventListener('input', rList));

/* 모의투자 */
const SIM_KEY = 'sd.sim';
const simDef = () => ({ cash: 10000000, start: 10000000, per: 1000000, hold: 20, stop: -.08, take: .15, pos: [], hist: [] });
let SIM = lsGet(SIM_KEY, null) || simDef();
const simSave = () => lsSet(SIM_KEY, SIM);
async function simUpdate() {
  // 보유 종목: 매수일 이후 종가로 손절·익절·보유기간 규칙을 차례로 적용
  let changed = false;
  for (const p of [...SIM.pos]) {
    let rec; try { rec = await load(`data/s/${p.code}.json`); } catch (_) { continue; }
    const k0 = rec.d.indexOf(p.date); if (k0 < 0) continue;
    p.last = rec.c.at(-1); p.lastDate = rec.d.at(-1);
    for (let i = k0 + 1; i < rec.d.length; i++) {
      const r = rec.c[i] / p.px - 1, held = i - k0;
      const why = r <= SIM.stop ? '손절' : r >= SIM.take ? '익절' : held >= SIM.hold ? '기간 만료' : null;
      if (why) { SIM.pos.splice(SIM.pos.indexOf(p), 1); SIM.cash += p.qty * rec.c[i]; SIM.hist.unshift({ code: p.code, name: p.name, date: p.date, px: p.px, qty: p.qty, outDate: rec.d[i], out: rec.c[i], why }); changed = true; break; }
    }
  }
  if (changed) simSave();
}
function simBuy(code) {
  const s = S.byCode[code]; if (!s) return false;
  if (SIM.pos.some((p) => p.code === code)) { toast('이미 보유 중입니다'); return false; }
  const q = Math.floor(Math.min(SIM.per, SIM.cash) / s.c); if (q < 1) { toast('현금이 부족합니다'); return false; }
  SIM.cash -= q * s.c; SIM.pos.push({ code, name: s.name, date: s.date, px: s.c, qty: q, last: s.c, lastDate: s.date }); simSave(); return true;
}
function rSim() {
  const val = SIM.pos.reduce((a, p) => a + p.qty * (p.last || p.px), 0), tot = SIM.cash + val;
  const closed = SIM.hist.map((h) => h.out / h.px - 1), win = closed.filter((x) => x > 0).length;
  $('#simSum').innerHTML = `<div class="kpi-row"><div class="kpi"><div class="k">평가 총액</div><div class="v">${fmt(tot)}</div></div><div class="kpi"><div class="k">누적 수익률</div><div class="v ${cls(tot / SIM.start - 1)}">${pct(tot / SIM.start - 1, 2)}</div></div><div class="kpi"><div class="k">승률 (청산 ${closed.length}건)</div><div class="v">${closed.length ? ((win / closed.length) * 100).toFixed(0) + '%' : '-'}</div></div></div><p class="note">현금 ${fmt(SIM.cash)}원 · 보유 ${SIM.pos.length}종목</p>`;
  $('#simPos').innerHTML = SIM.pos.length ? `<tr><th>종목</th><th>매수일</th><th>매수가</th><th>현재가</th><th>수익률</th></tr>` + SIM.pos.map((p) => `<tr class="go" data-code="${p.code}"><td>${esc(p.name)}</td><td>${md(p.date)}</td><td>${fmt(p.px)}</td><td>${fmt(p.last)}</td><td class="${cls(p.last / p.px - 1)}">${pct(p.last / p.px - 1)}</td></tr>`).join('') : '<tr><td class="empty">보유 종목이 없습니다</td></tr>';
  $('#simHist').innerHTML = SIM.hist.length ? `<tr><th>종목</th><th>매수</th><th>매도</th><th>사유</th><th>수익률</th></tr>` + SIM.hist.slice(0, 50).map((h) => `<tr><td>${esc(h.name)}</td><td>${md(h.date)} ${fmt(h.px)}</td><td>${md(h.outDate)} ${fmt(h.out)}</td><td>${h.why}</td><td class="${cls(h.out / h.px - 1)}">${pct(h.out / h.px - 1)}</td></tr>`).join('') : '<tr><td class="empty">아직 청산한 거래가 없습니다</td></tr>';
  $('#simRule').innerHTML = `<div class="seg-row" style="flex-direction:column;align-items:flex-start;gap:8px">
    <label>종목당 매수 금액 <input id="simPer" class="r" style="width:130px" value="${fmt(SIM.per)}"> 원</label>
    <label>손절 <select id="simStop">${[-.05, -.08, -.1, -.15].map((v) => `<option value="${v}"${v === SIM.stop ? ' selected' : ''}>${v * 100}%</option>`).join('')}</select> · 익절 <select id="simTake">${[.1, .15, .2, .3].map((v) => `<option value="${v}"${v === SIM.take ? ' selected' : ''}>+${v * 100}%</option>`).join('')}</select> · 최대 보유 <select id="simHold">${[5, 10, 20, 40].map((v) => `<option${v === SIM.hold ? ' selected' : ''}>${v}</option>`).join('')}</select>거래일</label>
    <div class="seg-row"><button type="button" class="btn pri" id="simAll">오늘 매수진입 종목 모두 매수</button><button type="button" class="btn" id="simReset">처음부터 다시 (1,000만원)</button></div></div>
    <p class="note">매수·매도는 그날 종가로 가정합니다. 매일 자료가 갱신되면 종가 기준으로 손절·익절·보유기간을 차례로 확인해 자동 청산합니다. 수수료·세금은 반영하지 않습니다. 이 브라우저에만 저장되며 실제 주문과 연결되어 있지 않습니다.</p>`;
  const cand = S.sum.stocks.filter((s) => S.J[s.code].verdict === '매수진입');
  $('#simCand').innerHTML = cand.length ? `<tr><th>종목</th><th>후보 강도</th><th class="r">현재가</th><th></th></tr>` + cand.map((s) => `<tr><td class="go" data-code="${s.code}">${nm(s)}</td><td>${sttag(s.strength)}</td><td class="r">${fmt(s.c)}</td><td class="r"><button type="button" class="btn" data-buy="${s.code}"${SIM.pos.some((p) => p.code === s.code) ? ' disabled' : ''}>매수</button></td></tr>`).join('') : '<tr><td class="empty">오늘 매수진입 종목이 없습니다</td></tr>';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]'); if (b) { e.stopPropagation(); if (simBuy(b.dataset.buy)) { toast('모의 매수했습니다'); rSim(); } return; }
  if (e.target.id === 'simAll') { let k = 0; for (const s of S.sum.stocks) if (S.J[s.code].verdict === '매수진입' && !SIM.pos.some((p) => p.code === s.code) && simBuy(s.code)) k++; toast(k ? `${k}종목 모의 매수` : '새로 살 종목이 없습니다'); rSim(); }
  if (e.target.id === 'simReset') { if (confirm('모의투자 기록을 모두 지우고 1,000만원으로 다시 시작할까요?')) { SIM = simDef(); simSave(); rSim(); } }
}, true);
document.addEventListener('change', (e) => {
  const id = e.target.id; if (!/^sim(Per|Stop|Take|Hold)$/.test(id)) return;
  if (id === 'simPer') SIM.per = Math.max(10000, +e.target.value.replace(/\D/g, '') || 1000000);
  if (id === 'simStop') SIM.stop = +e.target.value; if (id === 'simTake') SIM.take = +e.target.value; if (id === 'simHold') SIM.hold = +e.target.value;
  simSave(); rSim();
});

/* ───── 시작 ───── */
(async () => {
  if (!pw) { $('#stamp').textContent = '비밀번호가 없습니다. 새로고침해 다시 입력하세요.'; return; }
  try {
    S.sum = await load('data/summary.json');
    S.built = S.sum.built;
    S.sum.stocks.forEach((s) => (S.byCode[s.code] = s));
    rejudge();
    $('#stamp').textContent = `기준일 ${ymd(S.sum.date)} · ${S.sum.n}종목 · 갱신 ${new Date(S.sum.built).toLocaleString('ko-KR')}`;
    const first = S.byCode[S.code] ? S.code : (S.sum.stocks.find((s) => S.J[s.code].verdict === '매수진입') || S.sum.stocks[0] || {}).code;
    if (first) { S.code = first; $('#pickerName').textContent = S.byCode[first].name; try { S.rec = await load(`data/s/${first}.json`); S.A = E.analyze(S.rec); } catch (_) {} }
    await simUpdate();
    go(location.hash.slice(1) || 'market');
  } catch (e) {
    console.error(e);
    $('#stamp').textContent = '자료를 불러오지 못했습니다: ' + (e.message || e) + (String(e).includes('OperationError') ? ' (비밀번호가 바뀌었을 수 있습니다. 오른쪽 아래 잠금 후 다시 입력하세요)' : '');
  }
})();
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t) && t !== tab) go(t); });
})();
