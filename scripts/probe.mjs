// 데이터 출처 점검용: 각 주소의 응답 상태와 앞부분을 출력한다
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const C = '005930';
const T = [
  ['k200 entry naver', 'https://finance.naver.com/sise/entryJongmok.naver?type=KPI200&page=1'],
  ['k200 entry nhn', 'https://finance.naver.com/sise/entryJongmok.nhn?type=KPI200&page=1'],
  ['k200 mobile enroll', 'https://m.stock.naver.com/api/index/KPI200/enrollStocks?page=1&pageSize=100'],
  ['k200 mobile basic', 'https://m.stock.naver.com/api/index/KPI200/basic'],
  ['kospi mktcap html', 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page=1'],
  ['kosdaq mktcap html', 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=1&page=1'],
  ['kospi mktcap mobile', 'https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=100'],
  ['frgn html', `https://finance.naver.com/item/frgn.naver?code=${C}&page=1`],
  ['trend mobile', `https://m.stock.naver.com/api/stock/${C}/trend?pageSize=10`],
  ['fchart sise', `https://fchart.stock.naver.com/sise.nhn?symbol=${C}&timeframe=day&count=5&requestType=0`],
  ['siseJson', `https://api.finance.naver.com/siseJson.naver?symbol=${C}&requestType=1&startTime=20261020&endTime=20261104&timeframe=day`],
  ['chart api', `https://api.stock.naver.com/chart/domestic/item/${C}/day?startDateTime=202610200000&endDateTime=202611040000`],
  ['integration', `https://m.stock.naver.com/api/stock/${C}/integration`],
  ['upjong list', 'https://finance.naver.com/sise/sise_group.naver?type=upjong'],
  ['upjong detail', 'https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=278'],
  ['investor day mkt', 'https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=20261103&sosok=01'],
];
for (const [n, u] of T) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://finance.naver.com/' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || '';
    const txt = new TextDecoder(/euc-kr/i.test(ct) || /finance\.naver\.com\/(sise|item)/.test(u) && !/utf-8/i.test(ct) ? 'euc-kr' : 'utf-8').decode(buf);
    const body = txt.replace(/\s+/g, ' ');
    const codes = [...new Set([...txt.matchAll(/code=(\d{6})/g)].map((m) => m[1]))].length;
    console.log(`\n### ${n} → ${r.status} ${ct} len=${buf.length} codes=${codes}\n${body.slice(0, 600)}`);
    if (n === 'frgn html') { const i = body.indexOf('순매매량'); console.log('...frgn tbl:', body.slice(i - 200, i + 1500)); }
    if (n === 'upjong list') { console.log('...links:', [...txt.matchAll(/sise_group_detail[^"]*"[^>]*>[^<]{0,20}/g)].slice(0, 5).map((m) => m[0]).join(' | ')); }
  } catch (e) { console.log(`\n### ${n} → ERROR ${e.message}`); }
}
