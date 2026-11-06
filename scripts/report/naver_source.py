"""NaverSource — PRISM-INSIGHT 의 MarketDataSource 를 네이버 증권 공개 자료로 구현한 것.

PRISM 은 한국 시장 자료를 한국투자증권(KIS) Open API 로만 받도록 되어 있다. 이 파일을
PRISM 체크아웃의 cores/market_data/ 에 넣고 PRISM_NAVER_SOURCE=1 로 실행하면, KIS 대신
네이버 자료로 같은 형식(열 이름·attrs)의 데이터를 돌려준다.

  price_history        fchart 일봉(수정주가)                      Open/High/Low/Close/Volume
  index_history        fchart KOSPI/KOSDAQ 일봉                   Open/High/Low/Close/Volume
  investor_flows       m.stock trend(기관·외국인·개인 순매수 수량)  기관합계/외국인합계/개인/기타합계
  fundamentals         m.stock integration(PER·PBR·EPS·BPS)      최신 스냅샷
  market_cap_history   m.stock basic/integration(시가총액)        최신 스냅샷
  news_titles          m.stock 종목 뉴스                          published_at/provider/title
  ticker_name          m.stock basic
  intraday_investor_estimate  지원 안 함(Unsupported)
"""
from __future__ import annotations

import logging
import math
import re
import time as _time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from cores.market_data.schema import has_ohlcv, normalize
from cores.market_data.source import Unavailable, Unsupported

logger = logging.getLogger(__name__)
_KST = ZoneInfo("Asia/Seoul")
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
_M = "https://m.stock.naver.com/api"
_FCHART = "https://fchart.stock.naver.com/sise.nhn"
_INDEX = {"1001": "KOSPI", "2001": "KOSDAQ", "KOSPI": "KOSPI", "KOSDAQ": "KOSDAQ"}


def _num(v) -> float:
    if v is None:
        return float("nan")
    s = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        x = float(s)
        return x if math.isfinite(x) else float("nan")
    except ValueError:
        return float("nan")


def _won_from_korean(text: str) -> float:
    """'1,131조 2,549억' → 원"""
    if not text:
        return float("nan")
    total, found = 0.0, False
    for amount, unit in re.findall(r"([\d,\.]+)\s*(조|억|만)?", str(text)):
        a = _num(amount)
        if math.isnan(a):
            continue
        total += a * {"조": 1e12, "억": 1e8, "만": 1e4}.get(unit, 1)
        found = True
    return total if found else float("nan")


class NaverSource:
    name = "naver"

    def __init__(self) -> None:
        self._s = requests.Session()
        self._s.headers.update({"User-Agent": _UA, "Referer": "https://m.stock.naver.com/"})
        self._cache: dict = {}

    # ── HTTP ──
    def _get(self, url: str, *, params=None, json=True, encoding=None):
        last = None
        for attempt in range(3):
            try:
                r = self._s.get(url, params=params, timeout=15)
                if r.status_code != 200:
                    raise Unavailable(f"naver HTTP {r.status_code} {url}")
                if encoding:
                    r.encoding = encoding
                return r.json() if json else r.text
            except Unavailable as e:
                last = e
            except Exception as e:  # noqa: BLE001
                last = Unavailable(f"naver {type(e).__name__}: {e}")
            _time.sleep(0.6 * (attempt + 1))
        raise last

    @staticmethod
    def _sessions(start: str, end: str) -> int:
        d0 = datetime.strptime(start, "%Y%m%d")
        d1 = datetime.strptime(end, "%Y%m%d")
        today = datetime.now(_KST).replace(tzinfo=None)
        # end 이후~오늘까지의 날도 포함해 넉넉히 받은 뒤 잘라낸다
        days = (max(today, d1) - d0).days
        return max(30, int(days * 0.72) + 30)

    def _fchart(self, symbol: str, start: str, end: str, what: str) -> pd.DataFrame:
        xml = self._get(_FCHART, params={"symbol": symbol, "timeframe": "day", "count": self._sessions(start, end), "requestType": 0},
                        json=False, encoding="euc-kr")
        rows = []
        for d, rest in re.findall(r'data="(\d{8})\|([^"]+)"', xml):
            if not (start <= d <= end):
                continue
            o, h, l, c, v = (_num(x) for x in rest.split("|")[:5])
            if c > 0:
                rows.append({"date": d, "Open": o, "High": h, "Low": l, "Close": c, "Volume": v})
        if not rows:
            raise Unavailable(f"naver {what}: no rows {start}..{end}")
        frame = pd.DataFrame(rows).set_index("date")
        frame.index = pd.to_datetime(frame.index, format="%Y%m%d")
        frame = normalize(frame)
        frame.attrs.update(source="naver", observed_at=datetime.now(_KST).isoformat())
        return frame

    # ── 기능 ──
    def price_history(self, ticker: str, start: str, end: str, *, adjusted: bool = True) -> pd.DataFrame:
        frame = self._fchart(str(ticker).zfill(6), start, end, f"ohlcv {ticker}")
        if not has_ohlcv(frame):
            raise Unavailable(f"naver ohlcv {ticker} missing OHLCV columns")
        return frame

    def index_history(self, index_code: str, start: str, end: str) -> pd.DataFrame:
        sym = _INDEX.get(str(index_code))
        if not sym:
            raise Unsupported(f"no naver symbol for index {index_code}")
        return self._fchart(sym, start, end, f"index {index_code}")

    def investor_flows(self, ticker: str, start: str, end: str) -> pd.DataFrame:
        code = str(ticker).zfill(6)
        out: dict[str, dict] = {}
        cursor = ""
        for _ in range(30):
            params = {"pageSize": 60}
            if cursor:
                params["bizdate"] = cursor
            arr = self._get(f"{_M}/stock/{code}/trend", params=params)
            if not isinstance(arr, list) or not arr:
                break
            fresh = 0
            for x in arr:
                d = re.sub(r"\D", "", str(x.get("bizdate", "")))
                if len(d) != 8 or d in out:
                    continue
                org, frg = _num(x.get("organPureBuyQuant")), _num(x.get("foreignerPureBuyQuant"))
                ind = _num(x.get("individualPureBuyQuant"))
                row = {"기관합계": org, "외국인합계": frg}
                if not math.isnan(ind):
                    row["개인"] = ind
                    if not (math.isnan(org) or math.isnan(frg)):
                        row["기타합계"] = -(org + frg + ind)   # 순매수 합은 0 → 나머지 주체
                out[d] = row
                fresh += 1
            oldest = min(out) if out else ""
            if not fresh or len(arr) < 60 or oldest <= start:
                break
            cursor = oldest
        rows = {d: v for d, v in out.items() if start <= d <= end}
        if not rows:
            raise Unavailable(f"naver flows {ticker}: no rows {start}..{end}")
        frame = pd.DataFrame.from_dict(rows, orient="index")
        frame.index = pd.to_datetime(frame.index, format="%Y%m%d")
        frame = frame.sort_index()
        frame.attrs.update(source="NAVER", unit="shares", data_status="reported_daily",
                           observed_at=datetime.now(_KST).isoformat())
        return frame

    def intraday_investor_estimate(self, ticker: str, *, as_of=None) -> pd.DataFrame:
        raise Unsupported("naver source does not provide intraday investor estimates")

    def _integration(self, code: str) -> dict:
        key = ("integ", code)
        if key not in self._cache:
            self._cache[key] = self._get(f"{_M}/stock/{code}/integration")
        return self._cache[key]

    def _basic(self, code: str) -> dict:
        key = ("basic", code)
        if key not in self._cache:
            self._cache[key] = self._get(f"{_M}/stock/{code}/basic")
        return self._cache[key]

    def _infos(self, code: str) -> dict:
        j = self._integration(code)
        return {str(i.get("code", "")).lower(): i.get("value") for i in (j.get("totalInfos") or [])}

    @staticmethod
    def _snapshot(values: dict) -> pd.DataFrame:
        now = datetime.now(_KST)
        frame = pd.DataFrame([values], index=[pd.Timestamp(now.date())])
        frame.attrs.update({
            "source": "naver", "as_of": now.isoformat(), "observed_at": now.isoformat(), "latest_only": True,
            "data_status": "LATEST_SNAPSHOT_ONLY", "bar_status": "UNKNOWN",
            "note": "네이버 증권 조회 시점의 최신 스냅샷이며 과거 시계열이 아닙니다. 재무 기준기간은 확인되지 않았습니다.",
        })
        return frame

    def fundamentals(self, ticker: str, start: str, end: str) -> pd.DataFrame:
        info = self._infos(str(ticker).zfill(6))
        values = {k.upper(): _num(info.get(k)) for k in ("per", "pbr", "eps", "bps")}
        for k in ("PER", "PBR"):
            if not (values[k] > 0):
                values[k] = float("nan")
        if all(math.isnan(v) for v in values.values()):
            raise Unavailable(f"naver fundamentals {ticker} has no usable fields")
        return self._snapshot(values)

    def market_cap_history(self, ticker: str, start: str, end: str) -> pd.DataFrame:
        code = str(ticker).zfill(6)
        cap = _won_from_korean(self._infos(code).get("marketvalue"))
        if not (cap > 0):
            b = self._basic(code)
            cap = _num(b.get("marketValue")) * 1e8 if b.get("marketValue") else float("nan")
        if not (cap > 0):
            raise Unavailable(f"naver cap {ticker} unavailable")
        frame = self._snapshot({"MarketCap": cap})
        frame.attrs.update(data_status="current_snapshot", unit="KRW",
                           note="네이버 증권 조회 시점의 시가총액입니다. 과거 시계열이 아닙니다.")
        return frame

    def news_titles(self, ticker: str, start: str, end: str) -> pd.DataFrame:
        code = str(ticker).zfill(6)
        records = []
        for page in range(1, 6):
            data = self._get(f"{_M}/news/stock/{code}", params={"pageSize": 20, "page": page})
            items = []
            for group in data if isinstance(data, list) else []:
                items += group.get("items", []) if isinstance(group, dict) and "items" in group else [group]
            if not items:
                break
            oldest = "99999999"
            for it in items:
                dt = re.sub(r"\D", "", str(it.get("datetime") or it.get("dt") or ""))
                if len(dt) < 8:
                    continue
                d = dt[:8]
                oldest = min(oldest, d)
                if start <= d <= end:
                    records.append({"published_at": f"{d[:4]}-{d[4:6]}-{d[6:8]} {dt[8:10] or '00'}:{dt[10:12] or '00'}",
                                    "provider": it.get("officeName") or it.get("officeId") or "",
                                    "title": re.sub(r"<[^>]+>|&quot;|&amp;", "", str(it.get("title") or "")).strip(),
                                    "tag_codes": code, "tag_names": ""})
            if oldest < start:
                break
        records.sort(key=lambda r: r["published_at"], reverse=True)
        frame = pd.DataFrame(records, columns=["published_at", "provider", "title", "tag_codes", "tag_names"]).drop_duplicates("title")
        frame.attrs.update(source="NAVER", data_status="headlines_only", observed_at=datetime.now(_KST).isoformat())
        return frame

    def sector_info(self, ticker: str) -> dict:
        j = self._integration(str(ticker).zfill(6))
        name = (j.get("industryName") or (j.get("industryCompareInfo") or {}).get("industryName") or "")
        if not name:
            raise Unavailable(f"naver {ticker} has no industry name")
        return {"sector": str(name).strip(), "source": "naver", "as_of": datetime.now(_KST).isoformat(), "latest_only": True}

    def ticker_name(self, ticker: str) -> str:
        name = self._basic(str(ticker).zfill(6)).get("stockName")
        if not name:
            raise Unavailable(f"naver name {ticker} missing")
        return str(name).strip()


INSTALL_SNIPPET = '''

# ── 네이버 증권 소스로 교체 (stock-monitoring 리포트용, PRISM_NAVER_SOURCE=1) ──
if os.getenv("PRISM_NAVER_SOURCE") == "1":
    from cores.market_data.naver_source import NaverSource as _NaverSource
    _chain = SourceChain([_NaverSource()])
    logger.info("market data sources: naver (KIS replaced)")
'''
