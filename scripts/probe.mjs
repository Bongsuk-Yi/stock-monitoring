const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const T = [
  ['fchart KOSPI', 'https://fchart.stock.naver.com/sise.nhn?symbol=KOSPI&timeframe=day&count=5&requestType=0'],
  ['fchart KOSDAQ', 'https://fchart.stock.naver.com/sise.nhn?symbol=KOSDAQ&timeframe=day&count=5&requestType=0'],
  ['m index KOSPI price', 'https://m.stock.naver.com/api/index/KOSPI/price?pageSize=5&page=1'],
  ['marketValue', 'https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=2'],
];
for (const [n, u] of T) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); const t = await r.text(); console.log(`\n### ${n} → ${r.status}\n${t.replace(/\s+/g, ' ').slice(0, 900)}`); }
  catch (e) { console.log(`\n### ${n} → ERROR ${e.message}`); }
}
