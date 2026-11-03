// 데이터 출처 점검 2차: 투자자 추이 페이지 넘김, 업종, 시총 목록 범위
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const C = '005930';
const T = [
  ['trend 60', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=60`],
  ['trend 200', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=200`],
  ['trend bizdate', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=20&bizdate=20260601`],
  ['trend page2', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=20&page=2`],
  ['trend startIdx', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=20&startIdx=20`],
  ['investor api', `https://api.stock.naver.com/stock/${C}/trend?pageSize=20`],
  ['investor chart', `https://api.stock.naver.com/chart/domestic/item/${C}/investor?startDateTime=202605010000&endDateTime=202611040000`],
  ['industry list', 'https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=100'],
  ['industry 278', 'https://m.stock.naver.com/api/stocks/industry/278?page=1&pageSize=100'],
  ['kospi p3', 'https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=3&pageSize=100'],
];
for (const [n, u] of T) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' } });
    const txt = await r.text();
    let extra = '';
    try {
      const j = JSON.parse(txt);
      const arr = Array.isArray(j) ? j : j.stocks || j.groups || j.items || null;
      if (arr) extra = ` n=${arr.length} first=${JSON.stringify(arr[0]).slice(0, 200)} last=${JSON.stringify(arr.at(-1)).slice(0, 160)}`;
      else extra = ' keys=' + Object.keys(j).join(',');
    } catch (_) {}
    console.log(`\n### ${n} → ${r.status} len=${txt.length}${extra}\n${txt.replace(/\s+/g, ' ').slice(0, 300)}`);
  } catch (e) { console.log(`\n### ${n} → ERROR ${e.message}`); }
}
const r = await fetch(`https://m.stock.naver.com/api/stock/${C}/integration`, { headers: { 'User-Agent': UA } }); const j = await r.json();
console.log('\n### integration keys', Object.keys(j).join(','), '\nindustry:', JSON.stringify(j.industryCode ?? j.industryCompareInfo ?? '').slice(0, 400));
