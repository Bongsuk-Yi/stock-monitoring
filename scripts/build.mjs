// 사이트 빌드: 수집 자료(store.enc.json) → 분석 → 암호화된 화면 자료 + 암호화된 HTML → dist/
// 사용법: SITE_PASSWORD=... node scripts/build.mjs [store경로]
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { sitePassword, encrypt, makeKey, decryptNode, gatePage, LOCK_SNIPPET } from './gate.mjs';

const require = createRequire(import.meta.url);
const E = require('../js/engine.js');
const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const STORE = process.argv[2] || join(root, 'store.enc.json');
const STORE_KEY = 'supply-dash.pw';
const pw = sitePassword();
const K = makeKey(pw);
const put = (rel, obj) => { const f = join(dist, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(encrypt(JSON.stringify(obj), pw, K))); };

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'data', 's'), { recursive: true });
for (const f of ['index.html', 'styles.css', 'app.js', 'favicon.svg', 'manifest.webmanifest']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dist, f));
cpSync(join(root, 'js'), join(dist, 'js'), { recursive: true, filter: (p) => !p.endsWith('package.json') });
mkdirSync(join(dist, 'vendor'), { recursive: true });
cpSync(join(root, 'node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js'), join(dist, 'vendor/lightweight-charts.js'));

/* ── 분석 ── */
const store = existsSync(STORE) ? JSON.parse(decryptNode(JSON.parse(readFileSync(STORE, 'utf8')), pw)) : { stocks: {} };
const recs = Object.values(store.stocks).filter((r) => r.d && r.d.length >= 30);
const lastDate = recs.reduce((m, r) => (r.d.at(-1) > m ? r.d.at(-1) : m), '');
const rows = [], A = {};
for (const r of recs) {
  if (r.d.at(-1) !== lastDate) continue;              // 오늘 자료가 없는 종목(거래정지 등)은 목록에서 뺀다
  const a = E.analyze(r); A[r.code] = a;
  const s = E.summarize(r, a); if (s) rows.push(s);
  put(`data/s/${r.code}.json`, r);
}

/* ── 시장 전체(분석 종목 합계, 원) ── */
const dates = [...new Set(recs.flatMap((r) => r.d.slice(-120)))].sort().slice(-120);
const di = Object.fromEntries(dates.map((d, i) => [d, i]));
const mk = { dates, frg: dates.map(() => 0), org: dates.map(() => 0) };
for (const r of recs) r.d.forEach((d, i) => { if (d in di) { mk.frg[di[d]] += (r.frg[i] || 0) * r.c[i]; mk.org[di[d]] += (r.org[i] || 0) * r.c[i]; } });

/* ── 날짜별 강한 진입 · 상한가 기록(최근 30거래일) ── */
const hist = {};
for (const d of dates.slice(-30)) hist[d] = { strong: [], limitup: [] };
for (const r of recs) {
  const a = A[r.code]; if (!a) continue;
  r.d.forEach((d, i) => {
    if (!hist[d]) return;
    if (a.strength[i] === '강한 진입') { let k = 0; while (i - k >= 0 && a.strength[i - k] === '강한 진입') k++; hist[d].strong.push([r.code, k]); }
    if (i > 0 && r.c[i - 1] && r.c[i] / r.c[i - 1] - 1 >= .295) hist[d].limitup.push([r.code, r.c[i], r.c[i] / r.c[i - 1] - 1, a.strength[i]]);
  });
}

/* ── 업종: 세력 순매수 금액 → 매집수량 이동평균 ── */
const secDates = dates.slice(-120).length >= 60 ? [...new Set(recs.flatMap((r) => r.d.slice(-250)))].sort().slice(-250) : dates;
const sdi = Object.fromEntries(secDates.map((d, i) => [d, i]));
const secList = (store.sectors?.list || []).map((g) => {
  const net = secDates.map(() => 0); let n = 0;
  for (const code of g.members) {
    const r = store.stocks[code]; if (!r) continue; n++;
    r.d.forEach((d, i) => { if (d in sdi) net[sdi[d]] += ((r.frg[i] || 0) + (r.org[i] || 0)) * r.c[i]; });
  }
  const F = E.accumulate(net), L = net.length - 1;
  const sum = (k) => net.slice(-k).reduce((s, x) => s + x, 0);
  return { name: g.name, members: g.members, names: g.names, n, acc: F.acc.map(Math.round), ma5: F.ma5.map((x) => (x == null ? null : Math.round(x))), ma20: F.ma20.map((x) => (x == null ? null : Math.round(x))), net1: net[L] || 0, net5: sum(5), net20: sum(20), up: F.ma5[L] != null && F.ma20[L] != null && F.ma5[L] > F.ma20[L], ratio: F.ratio[L] };
});

put('data/summary.json', { built: new Date().toISOString(), date: lastDate, n: rows.length, stocks: rows, market: mk, hist, sectors: secList, secDates });
writeFileSync(join(dist, 'data', 'key.json'), JSON.stringify({ salt: K.salt.toString('base64') }));

/* ── HTML 암호화 ── */
const ver = Date.now().toString(36);
let html = readFileSync(join(dist, 'index.html'), 'utf8').replace(/(href|src)="(styles\.css|app\.js|js\/engine\.js)"/g, `$1="$2?v=${ver}"`).replace(/<\/body>/i, LOCK_SNIPPET(STORE_KEY) + '\n</body>');
writeFileSync(join(dist, 'index.html'), gatePage({ title: '수급 대시보드', mark: '📊', storeKey: STORE_KEY, envelope: encrypt(html, pw), theme: 'light' }));
writeFileSync(join(dist, '.nojekyll'), '');
const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + size(join(p, f)), 0) : statSync(p).size);
console.log(`빌드 완료: 기준일 ${lastDate || '-'}, 종목 ${rows.length}, 업종 ${secList.length}, dist ${(size(dist) / 1048576).toFixed(1)}MB`);
