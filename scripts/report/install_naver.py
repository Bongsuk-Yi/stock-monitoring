#!/usr/bin/env python3
"""PRISM 체크아웃(cwd)에 네이버 소스를 끼워 넣는다. 원본 파일은 끝에 몇 줄만 덧붙인다."""
import shutil, sys
from pathlib import Path
here = Path(__file__).resolve().parent
dst = Path("cores/market_data")
shutil.copy(here / "naver_source.py", dst / "naver_source.py")
sys.path.insert(0, str(Path.cwd()))
init = dst / "__init__.py"
s = init.read_text(encoding="utf-8")
if "PRISM_NAVER_SOURCE" not in s:
    snippet = (here / "naver_source.py").read_text(encoding="utf-8").split("INSTALL_SNIPPET = '''")[1].split("'''")[0]
    init.write_text(s + snippet, encoding="utf-8")
# 업종 정보: KIS 마스터 대신 네이버 업종명(종목 1개)으로
km = Path("cores/kis_sector_map.py")
k = km.read_text(encoding="utf-8")
if "PRISM_NAVER_SOURCE" not in k:
    k += '''

import os as _os
if _os.getenv("PRISM_NAVER_SOURCE") == "1":
    def get_sector_info(reference_date, market="ALL"):  # noqa: F811 - 네이버 소스에서는 시장 전체 업종 맵을 만들지 않는다
        return {}
'''
    km.write_text(k, encoding="utf-8")
# 수급 요약 문구의 출처 표기를 네이버로
fe = Path("prism_core/kr_flow_evidence.py")
t = fe.read_text(encoding="utf-8")
t = (t.replace('"source": "KIS"', '"source": "NAVER"').replace("원천: KIS", "원천: 네이버 증권").replace("출처: KIS", "출처: 네이버 증권")
      .replace("KIS 시장지수의 관측 거래일", "네이버 증권 지수의 관측 거래일").replace("KIS_benchmark_observed_sessions", "NAVER_benchmark_observed_sessions"))
fe.write_text(t, encoding="utf-8")
print("naver source installed")
