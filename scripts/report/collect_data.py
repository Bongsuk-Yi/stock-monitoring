#!/usr/bin/env python3
"""리포트용 자료 수집 (표준 라이브러리만 사용).
  python collect_data.py --market KR --code 005930 --name 삼성전자 --out data
한국: 네이버 증권(일봉·수급·지표·업종·재무·뉴스), 미국: Yahoo Finance 일봉.
결과: data/brief.md(사람이 읽는 요약 표·지표) + data/raw_*.json(원본)
"""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
M = "https://m.stock.naver.com/api"
KST = ZoneInfo("Asia/Seoul")


def get(url, params=None, raw=False, enc="utf-8"):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last = None
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://m.stock.naver.com/"})
            b = urllib.request.urlopen(req, timeout=20).read()
            t = b.decode(enc, "replace")
            return t if raw else json.loads(t)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.8 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def try_get(*a, **k):
    try:
        return get(*a, **k)
    except Exception as e:  # noqa: BLE001
        print("  (건너뜀)", e)
        return None


def num(v):
    if v is None:
        return math.nan
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        return float(s) if s not in ("", "-", ".") else math.nan
    except ValueError:
        return math.nan


def fchart(symbol, count=300):
    xml = get("https://fchart.stock.naver.com/sise.nhn", {"symbol": symbol, "timeframe": "day", "count": count, "requestType": 0},
              raw=True, enc="euc-kr")
    bars = []
    for d, rest in re.findall(r'data="(\d{8})\|([^"]+)"', xml):
        o, h, l, c, v = (num(x) for x in rest.split("|")[:5])
        if c > 0:
            bars.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:]}", "o": o, "h": h, "l": l, "c": c, "v": v})
    return bars


def yahoo(symbol):
    j = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}", {"range": "2y", "interval": "1d"})
    r = j["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    adj = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose")
    bars = []
    for i, ts in enumerate(r.get("timestamp") or []):
        c = q["close"][i]
        if c is None:
            continue
        k = (adj[i] / c) if adj and adj[i] else 1.0
        bars.append({"date": datetime.fromtimestamp(ts, ZoneInfo(r["meta"].get("exchangeTimezoneName") or "UTC")).strftime("%Y-%m-%d"),
                     "o": (q["open"][i] or c) * k, "h": (q["high"][i] or c) * k, "l": (q["low"][i] or c) * k, "c": c * k,
                     "v": q["volume"][i] or 0})
    return bars, r["meta"]


# ── 지표 ──
def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else math.nan


def rsi(cs, n=14):
    if len(cs) <= n:
        return math.nan
    g = l = 0.0
    for i in range(1, n + 1):
        d = cs[i] - cs[i - 1]
        g += max(d, 0); l += max(-d, 0)
    g /= n; l /= n
    for i in range(n + 1, len(cs)):
        d = cs[i] - cs[i - 1]
        g = (g * (n - 1) + max(d, 0)) / n; l = (l * (n - 1) + max(-d, 0)) / n
    return 100.0 if l == 0 else 100 - 100 / (1 + g / l)


def ema(xs, n):
    k, e, out = 2 / (n + 1), xs[0], []
    for x in xs:
        e = x * k + e * (1 - k); out.append(e)
    return out


def ret(cs, n):
    return (cs[-1] / cs[-1 - n] - 1) * 100 if len(cs) > n else math.nan


def f(x, d=1, pct=False):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "-"
    s = f"{x:,.{d}f}"
    return (("+" if x > 0 else "") + s + "%") if pct else s


def tech(bars, label):
    cs, vs = [b["c"] for b in bars], [b["v"] for b in bars]
    last = bars[-1]
    y = bars[-252:] if len(bars) >= 252 else bars
    hi, lo = max(b["h"] for b in y), min(b["l"] for b in y)
    macd = [a - b for a, b in zip(ema(cs, 12), ema(cs, 26))]
    sig = ema(macd, 9)
    atr = sum(max(b["h"] - b["l"], abs(b["h"] - p["c"]), abs(b["l"] - p["c"])) for p, b in zip(bars[-15:-1], bars[-14:])) / 14 if len(bars) > 15 else math.nan
    L = [f"### {label} 기술 지표 (기준일 {last['date']})", "",
         "| 항목 | 값 |", "|---|---|",
         f"| 종가 | {f(last['c'], 2 if last['c'] < 1000 else 0)} |",
         f"| 등락 1일·1주·1개월·3개월·6개월·1년 | {f(ret(cs,1),2,1)} · {f(ret(cs,5),1,1)} · {f(ret(cs,21),1,1)} · {f(ret(cs,63),1,1)} · {f(ret(cs,126),1,1)} · {f(ret(cs,252),1,1)} |"]
    for n in (5, 20, 60, 120, 200):
        m = sma(cs, n)
        L.append(f"| MA{n} (종가 대비) | {f(m, 2 if m < 1000 else 0)} ({f((cs[-1]/m-1)*100 if m==m else math.nan,1,1)}) |")
    L += [f"| 52주 고가 / 저가 | {f(hi, 2 if hi < 1000 else 0)} ({f((cs[-1]/hi-1)*100,1,1)}) / {f(lo, 2 if lo < 1000 else 0)} ({f((cs[-1]/lo-1)*100,1,1)}) |",
          f"| RSI(14) | {f(rsi(cs))} |",
          f"| MACD / 시그널 | {f(macd[-1],2)} / {f(sig[-1],2)} ({'MACD 위' if macd[-1] > sig[-1] else 'MACD 아래'}) |",
          f"| ATR(14) / 종가 | {f(atr, 2)} ({f(atr/cs[-1]*100 if atr==atr else math.nan,2)}%) |",
          f"| 거래량 (당일 / 20일 평균) | {f(vs[-1],0)} / {f(sma(vs,20),0)} (×{f(vs[-1]/sma(vs,20) if sma(vs,20) else math.nan,2)}) |", ""]
    return L


def bars_table(bars, n=60):
    L = ["| 날짜 | 시가 | 고가 | 저가 | 종가 | 거래량 |", "|---|---|---|---|---|---|"]
    d = 2 if bars[-1]["c"] < 1000 else 0
    for b in reversed(bars[-n:]):
        L.append(f"| {b['date']} | {f(b['o'],d)} | {f(b['h'],d)} | {f(b['l'],d)} | {f(b['c'],d)} | {f(b['v'],0)} |")
    return L + [""]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True); ap.add_argument("--code", required=True)
    ap.add_argument("--name", default=""); ap.add_argument("--out", default="data")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    save = lambda n, o: (out / f"raw_{n}.json").write_text(json.dumps(o, ensure_ascii=False, indent=1), encoding="utf-8") if o is not None else None
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M KST")
    B = [f"# {a.name} ({a.code}) 수집 자료", "", f"- 수집 시각: {now}", ""]

    if a.market == "KR":
        code = a.code
        print("일봉"); bars = fchart(code, 300)
        if len(bars) < 30:
            print("::error::일봉 자료가 부족합니다"); sys.exit(1)
        save("ohlcv", bars)
        integ = try_get(f"{M}/stock/{code}/integration"); save("integration", integ)
        basic = try_get(f"{M}/stock/{code}/basic"); save("basic", basic)
        for k in ("annual", "quarter"):
            save(f"finance_{k}", try_get(f"{M}/stock/{code}/finance/{k}"))
        print("수급")
        flows, cursor = {}, ""
        for _ in range(3):
            p = {"pageSize": 60}
            if cursor: p["bizdate"] = cursor
            arr = try_get(f"{M}/stock/{code}/trend", p)
            if not isinstance(arr, list) or not arr: break
            for x in arr:
                d = re.sub(r"\D", "", str(x.get("bizdate", "")))
                if len(d) == 8: flows[d] = x
            cursor = min(flows) if flows else ""
            if len(arr) < 60: break
        fl = [flows[d] for d in sorted(flows)]
        save("investor_trend", fl)
        print("뉴스")
        news = []
        for page in (1, 2, 3):
            data = try_get(f"{M}/news/stock/{code}", {"pageSize": 20, "page": page})
            if not data: break
            for g in data if isinstance(data, list) else []:
                news += g.get("items", []) if isinstance(g, dict) and "items" in g else [g]
        save("news", news)
        idx = {}
        for s in ("KOSPI", "KOSDAQ"):
            try: idx[s] = fchart(s, 300)
            except Exception as e: print("  지수 건너뜀", s, e)

        # brief
        if basic: B.append(f"- 시장: {basic.get('stockExchangeType', {}).get('nameKor') or basic.get('stockExchangeName') or ''}")
        if integ:
            ici = integ.get("industryCompareInfo")
            ind = integ.get("industryName") or (ici.get("industryName") if isinstance(ici, dict) else "")
            if ind: B.append(f"- 업종: {ind}")
            B += ["", "## 투자 지표 (네이버 증권 최신값)", "", "| 항목 | 값 |", "|---|---|"]
            for i in integ.get("totalInfos") or []:
                B.append(f"| {i.get('key') or i.get('code')} | {i.get('value')} |")
            B.append("")
            peers = (integ.get("industryCompareInfo") or [])
            if isinstance(peers, list) and peers:
                B += ["## 동종 업종 비교", "", "| 종목 | 현재가 | 등락률 | 시가총액 |", "|---|---|---|---|"]
                for p in peers[:10]:
                    B.append(f"| {p.get('stockName')} ({p.get('itemCode')}) | {p.get('closePrice')} | {p.get('fluctuationsRatio')}% | {p.get('marketValue')} |")
                B.append("")
        B += tech(bars, a.name)
        for s, ib in idx.items():
            if len(ib) > 30:
                B += tech(ib, s)
        if fl:
            org = [num(x.get("organPureBuyQuant")) for x in fl]
            frg = [num(x.get("foreignerPureBuyQuant")) for x in fl]
            ind = [num(x.get("individualPureBuyQuant")) for x in fl]
            sm = lambda xs, n: sum(v for v in xs[-n:] if v == v)
            B += ["## 투자자별 순매수 (주식 수, 네이버 증권)", "",
                  "| 기간 | 기관 | 외국인 | 개인 |", "|---|---|---|---|"]
            for n in (1, 5, 20, 60, len(fl)):
                B.append(f"| 최근 {n}일 | {f(sm(org,n),0)} | {f(sm(frg,n),0)} | {f(sm(ind,n),0)} |")
            B += ["", "| 날짜 | 종가 | 기관 | 외국인 | 개인 | 외국인 보유율 |", "|---|---|---|---|---|---|"]
            for x in reversed(fl[-30:]):
                d = re.sub(r"\D", "", str(x.get("bizdate", "")))
                B.append(f"| {d[:4]}-{d[4:6]}-{d[6:]} | {x.get('closePrice','')} | {x.get('organPureBuyQuant','')} | {x.get('foreignerPureBuyQuant','')} | {x.get('individualPureBuyQuant','')} | {x.get('foreignerHoldRatio','')} |")
            B.append("")
        if news:
            B += ["## 최근 뉴스 제목 (네이버 증권)", ""]
            seen = set()
            for it in news:
                t = re.sub(r"<[^>]+>|&quot;|&amp;", "", str(it.get("title") or "")).strip()
                if not t or t in seen: continue
                seen.add(t)
                dt = re.sub(r"\D", "", str(it.get("datetime") or ""))
                B.append(f"- {dt[:4]}-{dt[4:6]}-{dt[6:8]} · {it.get('officeName','')} · {t}")
                if len(seen) >= 40: break
            B.append("")
        B += ["## 최근 60거래일 일봉", ""] + bars_table(bars)
    else:
        print("Yahoo 일봉"); bars, meta = yahoo(a.code)
        if len(bars) < 30:
            print("::error::일봉 자료가 부족합니다"); sys.exit(1)
        save("ohlcv", bars); save("meta", meta)
        B += [f"- 거래소: {meta.get('fullExchangeName') or meta.get('exchangeName','')} · 통화: {meta.get('currency','')}", ""]
        B += tech(bars, a.name or a.code)
        for s, label in (("^GSPC", "S&P 500"), ("^IXIC", "NASDAQ")):
            try:
                ib, _ = yahoo(s); B += tech(ib, label)
            except Exception as e: print("  지수 건너뜀", s, e)
        B += ["## 최근 60거래일 일봉 (수정주가)", ""] + bars_table(bars)
        B += ["> 재무·실적·뉴스는 수집 자료에 없으므로 웹 검색으로 확인해야 합니다.", ""]

    (out / "brief.md").write_text("\n".join(B), encoding="utf-8")
    print("저장:", out / "brief.md", f"({len(B)}줄)", "· 원본:", ", ".join(sorted(p.name for p in out.glob('raw_*.json'))))


if __name__ == "__main__":
    main()
