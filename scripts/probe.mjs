// 데이터 출처 응답 확인 (GitHub Actions에서 실행)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const T = {
  yahoo: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d',
  yahooQuote: 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,KRW%3DX',
  fred: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10',
  cnnFG: 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
  nvIdxBasic: 'https://m.stock.naver.com/api/index/KOSPI/basic',
  nvIdxInteg: 'https://m.stock.naver.com/api/index/KOSPI/integration',
  nvIdxTrend: 'https://m.stock.naver.com/api/index/KOSPI/trend',
  nvIdxPrice: 'https://m.stock.naver.com/api/index/KOSPI/price?pageSize=5&page=1',
  nvUp: 'https://m.stock.naver.com/api/stocks/up/KOSPI?page=1&pageSize=5',
  nvDown: 'https://m.stock.naver.com/api/stocks/down/KOSDAQ?page=1&pageSize=5',
  nvTheme: 'https://m.stock.naver.com/api/stocks/theme?page=1&pageSize=5',
  nvIndustry: 'https://m.stock.naver.com/api/stocks/industry?page=1&pageSize=5',
  nvDeal: 'https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=3',
  nvInvestorDeal: 'https://m.stock.naver.com/api/index/KOSPI/investorTrend',
  nvForeignBuy: 'https://m.stock.naver.com/api/stocks/foreignBuy/KOSPI?page=1&pageSize=5',
  nvWorldIdx: 'https://api.stock.naver.com/index/.INX/basic',
  nvUS: 'https://api.stock.naver.com/stock/exchange/NASDAQ/up?page=1&pageSize=5',
  nvMarketIndex: 'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
  nvNews: 'https://m.stock.naver.com/api/news/list?category=mainnews&page=1&pageSize=5',
  nvDepositCredit: 'https://m.stock.naver.com/api/index/deposit',
  rssYna: 'https://www.yna.co.kr/rss/economy.xml',
  rssInfomax: 'https://news.einfomax.co.kr/rss/allArticle.xml',
  rssHk: 'https://www.hankyung.com/feed/finance',
  rssMk: 'https://www.mk.co.kr/rss/50200011/',
  rssCnbc: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
  rssGoogleKR: 'https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC&hl=ko&gl=KR&ceid=KR:ko',
  nasdaqEarn: `https://api.nasdaq.com/api/calendar/earnings?date=${d}`,
  nasdaqEcon: `https://api.nasdaq.com/api/calendar/economicevents?date=${d}`,
  cftc: 'https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=2',
  secForm4: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=only&count=5&output=atom',
  openinsider: 'http://openinsider.com/latest-insider-trading',
  kofia: 'https://freesis.kofia.or.kr/',
  krxShort: 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',
};
for (const [k, u] of Object.entries(T)) {
  try {
    const h = { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'ko,en;q=0.8' };
    if (u.includes('sec.gov')) h['User-Agent'] = 'personal-research contact@example.com';
    if (u.includes('naver')) h.Referer = 'https://m.stock.naver.com/';
    const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    console.log(`\n### ${k} ${r.status} ${t.length}B\n${t.replace(/\s+/g, ' ').slice(0, 700)}`);
  } catch (e) { console.log(`\n### ${k} ERR ${e.message}`); }
}
