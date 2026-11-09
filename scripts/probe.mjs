const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const T = {
  idxTrendPage: 'https://m.stock.naver.com/api/index/KOSPI/trend?pageSize=10&page=1',
  idxTrendBiz: 'https://m.stock.naver.com/api/index/KOSPI/trend?bizdate=20261105',
  idxPrice: 'https://m.stock.naver.com/api/index/KOSDAQ/price?pageSize=3&page=1',
  themeDetail: 'https://m.stock.naver.com/api/stocks/theme/586?page=1&pageSize=3',
  themeAll: 'https://m.stock.naver.com/api/stocks/theme?page=1&pageSize=100',
  usUp: 'https://api.stock.naver.com/stock/exchange/NASDAQ/up?page=1&pageSize=2',
  usDown: 'https://api.stock.naver.com/stock/exchange/NYSE/down?page=1&pageSize=2',
  usMktValue: 'https://api.stock.naver.com/stock/exchange/NASDAQ/marketValue?page=1&pageSize=2',
  fred: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-08-01',
  fredApi: 'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json',
  yahooMulti: 'https://query1.finance.yahoo.com/v8/finance/chart/KRW%3DX?range=3mo&interval=1d',
  yahooSpark: 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=%5EGSPC,%5EVIX,CL%3DF&range=1mo&interval=1d',
  nasdaqEarn: `https://api.nasdaq.com/api/calendar/earnings?date=${d}`,
  nvNewsMain: 'https://m.stock.naver.com/api/news/list?category=mainnews&page=1&pageSize=3',
  nvNewsFlash: 'https://m.stock.naver.com/api/news/list?category=flashnews&page=1&pageSize=3',
  nvSiseRank: 'https://m.stock.naver.com/api/stocks/searchTop/KOSPI?page=1&pageSize=3',
  nvTradeValue: 'https://m.stock.naver.com/api/stocks/quantTop/KOSPI?page=1&pageSize=3',
  nvPriceTop: 'https://m.stock.naver.com/api/stocks/priceTop/KOSPI?page=1&pageSize=3',
  nvExchangeList: 'https://m.stock.naver.com/front-api/marketIndex/exchange/majors',
  nvCredit: 'https://m.stock.naver.com/front-api/marketIndex/deposit',
  kofiaCredit: 'https://freesis.kofia.or.kr/meta/getMetaDataList.do',
  nvKosdaqUpDown: 'https://m.stock.naver.com/api/index/KOSDAQ/integration',
};
for (const [k, u] of Object.entries(T)) {
  try {
    const h = { 'User-Agent': UA, Accept: '*/*', Referer: 'https://m.stock.naver.com/' };
    const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(45000) });
    const t = await r.text();
    console.log(`\n### ${k} ${r.status} ${t.length}B\n${t.replace(/\s+/g, ' ').slice(0, 900)}`);
  } catch (e) { console.log(`\n### ${k} ERR ${e.message}`); }
}
