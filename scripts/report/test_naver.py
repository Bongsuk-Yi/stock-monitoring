#!/usr/bin/env python3
"""네이버 소스 시험: PRISM 이 리포트에서 실제로 부르는 경로(체인·MCP 도구·사전 수집)를 그대로 호출한다."""
import json, os, sys, traceback
from datetime import datetime, timedelta
sys.path.insert(0, os.getcwd())
os.environ["PRISM_NAVER_SOURCE"] = "1"
import requests
UA = {"User-Agent": "Mozilla/5.0"}
code = sys.argv[1] if len(sys.argv) > 1 else "005930"
for u in [f"https://m.stock.naver.com/api/stock/{code}/integration", f"https://m.stock.naver.com/api/news/stock/{code}?pageSize=3&page=1", f"https://m.stock.naver.com/api/stock/{code}/trend?pageSize=1"]:
    try:
        j = requests.get(u, headers=UA, timeout=15).json()
        print("\n#RAW", u.split('/api/')[1], json.dumps(j, ensure_ascii=False)[:1500])
    except Exception as e: print("#RAW fail", u, e)

from cores.market_data import default_chain
ch = default_chain(); print("\nchain:", ch.names)
end = datetime.now().strftime("%Y%m%d"); start = (datetime.now() - timedelta(days=400)).strftime("%Y%m%d")
ok = 0
for cap, args in [("price_history", (code, start, end)), ("index_history", ("1001", start, end)), ("index_history", ("2001", start, end)),
                  ("investor_flows", (code, (datetime.now() - timedelta(days=60)).strftime("%Y%m%d"), end)),
                  ("fundamentals", (code, end, end)), ("market_cap_history", (code, end, end)),
                  ("news_titles", (code, (datetime.now() - timedelta(days=14)).strftime("%Y%m%d"), end)), ("ticker_name", (code,))]:
    try:
        r = ch.fetch(cap, *args)
        if hasattr(r, "shape"):
            print(f"\n[OK] {cap}{args[:1]} shape={r.shape} cols={list(r.columns)}\n{r.tail(3).to_string()[:600]}"); ok += 1
        else:
            print(f"\n[OK] {cap} -> {r}"); ok += 1
    except Exception as e:
        print(f"\n[FAIL] {cap}: {type(e).__name__}: {e}")
print(f"\n체인 기능 {ok}/8 성공")

print("\n── MCP 도구(에이전트가 부르는 것) ──")
import cores.market_data.mcp_server as M
for fn, args in [("get_stock_ohlcv", (start[:8], end, code)), ("get_stock_trading_volume", ((datetime.now() - timedelta(days=30)).strftime("%Y%m%d"), end, code)),
                 ("get_stock_market_cap", (end, end, code)), ("get_index_ohlcv", ((datetime.now() - timedelta(days=30)).strftime("%Y%m%d"), end, "1001")), ("get_ticker_name", (code,))]:
    try:
        f = getattr(M, fn); f = getattr(f, "fn", f)
        r = f(*args); s = json.dumps(r, ensure_ascii=False, default=str)
        print(f"[{'FAIL' if 'error' in s[:200] else 'OK'}] {fn}: {s[:300]}")
    except Exception as e:
        print(f"[FAIL] {fn}: {type(e).__name__}: {e}")

print("\n── 리포트 사전 수집(prefetch_kr_analysis_data) ──")
try:
    from cores.data_prefetch import prefetch_kr_analysis_data
    pre = prefetch_kr_analysis_data(code, end, (datetime.now() - timedelta(days=365)).strftime("%Y%m%d"))
    for k, v in pre.items():
        print(f"  {k}: {len(str(v))}자  {str(v)[:160]!r}")
except Exception:
    traceback.print_exc()
