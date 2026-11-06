#!/usr/bin/env python3
"""PRISM-INSIGHT 단일 종목 AI 리포트 생성 (GitHub Actions에서 실행).
PRISM-INSIGHT 저장소를 체크아웃한 폴더(cwd) 안에서 실행한다.
  python run_report.py --market KR --code 005930 --name 삼성전자 --lang ko --out ../out
결과: out/report.md, out/report.pdf(가능할 때), out/meta.json
"""
import argparse, asyncio, json, shutil, sys, time, traceback
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

root = Path.cwd()
sys.path.insert(0, str(root))

def kst_today():
    return datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d")

async def run_kr(code, name, lang):
    from cores.analysis import analyze_stock
    from report_generator import save_report, save_pdf_report
    content = await analyze_stock(company_code=code, company_name=name, reference_date=kst_today(), language=lang)
    md = save_report(code, name, content)
    try:
        pdf = save_pdf_report(code, name, md)
    except Exception as e:  # PDF 실패해도 마크다운은 남긴다
        print("PDF 변환 실패:", e); pdf = None
    return content, md, pdf

async def run_us(ticker, name, lang):
    sys.path.insert(0, str(root / "prism-us"))
    import importlib.util
    spec = importlib.util.spec_from_file_location("us_analysis", root / "prism-us" / "cores" / "us_analysis.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    from report_generator import save_us_report, save_us_pdf_report
    import yaml
    news = False
    try:
        cfg = yaml.safe_load(open(root / "mcp_agent.config.yaml"))
        key = cfg["mcp"]["servers"]["perplexity"]["env"]["PERPLEXITY_API_KEY"]
        news = bool(key) and key != "example key"
    except Exception:
        pass
    content = await mod.analyze_us_stock(ticker=ticker, company_name=name, reference_date=kst_today(), language=lang, include_news=news)
    md = save_us_report(ticker, name, content)
    try:
        pdf = save_us_pdf_report(ticker, name, md)
    except Exception as e:
        print("PDF 변환 실패:", e); pdf = None
    return content, md, pdf

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True, choices=["KR", "US"])
    ap.add_argument("--code", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--lang", default="ko")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    fn = run_kr if a.market == "KR" else run_us
    try:
        content, md, pdf = asyncio.run(fn(a.code, a.name, a.lang))
    except Exception:
        traceback.print_exc(); sys.exit(1)
    if not content or len(content) < 500:
        print("리포트 내용이 너무 짧습니다(분석 실패로 판단):", len(content or "")); sys.exit(1)
    (out / "report.md").write_text(content, encoding="utf-8")
    if pdf and Path(pdf).exists():
        shutil.copy(pdf, out / "report.pdf")
    meta = {"market": a.market, "code": a.code, "name": a.name, "lang": a.lang, "date": kst_today(),
            "created": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(timespec="seconds"),
            "seconds": round(time.time() - t0), "chars": len(content), "pdf": (out / "report.pdf").exists()}
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print("완료:", json.dumps(meta, ensure_ascii=False))

if __name__ == "__main__":
    main()
