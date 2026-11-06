#!/usr/bin/env python3
"""GitHub Secrets → PRISM-INSIGHT 설정 파일. PRISM 체크아웃 폴더(cwd)에서 실행한다.
필수: OPENAI_API_KEY / KR 이면 KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT
선택: PERPLEXITY_API_KEY 또는 TAVILY_API_KEY(뉴스·웹 검색), FIRECRAWL_API_KEY(기업 웹 정보)
"""
import os, sys, yaml
market = sys.argv[1]
env = lambda k: (os.environ.get(k) or "").strip()
missing = [k for k in ["OPENAI_API_KEY"] + (["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT"] if market == "KR" else []) if not env(k)]
if missing:
    print("::error::다음 GitHub Secret 이 없습니다: " + ", ".join(missing) + " — 저장소 Settings → Secrets and variables → Actions 에 등록하세요.")
    sys.exit(1)

# mcp_agent.secrets.yaml
sec = yaml.safe_load(open("mcp_agent.secrets.yaml.example"))
sec["openai"]["api_key"] = env("OPENAI_API_KEY")
if env("ANTHROPIC_API_KEY"): sec.setdefault("anthropic", {})["api_key"] = env("ANTHROPIC_API_KEY")
yaml.safe_dump(sec, open("mcp_agent.secrets.yaml", "w"), allow_unicode=True)

# mcp_agent.config.yaml — 키가 없는 선택 서버는 빼서 에이전트가 쓰지 않게 한다
cfg = yaml.safe_load(open("mcp_agent.config.yaml.example"))
srv = cfg["mcp"]["servers"]
if env("PERPLEXITY_API_KEY"): srv["perplexity"]["env"]["PERPLEXITY_API_KEY"] = env("PERPLEXITY_API_KEY")
if env("FIRECRAWL_API_KEY"): srv["firecrawl"]["env"]["FIRECRAWL_API_KEY"] = env("FIRECRAWL_API_KEY")
else: print("참고: FIRECRAWL_API_KEY 없음 — 기업 웹페이지 수집은 생략될 수 있습니다")
yaml.safe_dump(cfg, open("mcp_agent.config.yaml", "w"), allow_unicode=True, sort_keys=False)

# .env
lines = ["PRISM_MARKET_DATA_SOURCES=kis", "PRISM_REPORT_DATA_SOURCES=kis", "PRISM_PARALLEL_REPORT=false"]
if not env("PERPLEXITY_API_KEY") and env("TAVILY_API_KEY"):
    lines += ["PRISM_WEB_SEARCH_PROVIDER=tavily", "TAVILY_API_KEY=" + env("TAVILY_API_KEY")]
if env("PERPLEXITY_API_KEY"): lines.append("PERPLEXITY_API_KEY=" + env("PERPLEXITY_API_KEY"))
if env("REPORT_MODEL"): lines.append("REPORT_MODEL=" + env("REPORT_MODEL"))
open(".env", "a").write("\n" + "\n".join(lines) + "\n")
if not env("PERPLEXITY_API_KEY") and not env("TAVILY_API_KEY"):
    print("참고: PERPLEXITY/TAVILY 키 없음 — 뉴스·웹 검색이 빠지거나 약해질 수 있습니다")

# trading/config/kis_devlp.yaml — 시세 조회 전용(자동매매 꺼짐)
if market == "KR":
    k = yaml.safe_load(open("trading/config/kis_devlp.yaml.example"))
    acct = env("KIS_ACCOUNT").replace("-", "")
    k.update({"auto_trading": False, "default_mode": "real", "my_app": env("KIS_APP_KEY"), "my_sec": env("KIS_APP_SECRET"),
              "paper_app": env("KIS_APP_KEY"), "paper_sec": env("KIS_APP_SECRET"), "my_htsid": env("KIS_HTS_ID") or "none"})
    k["accounts"] = [{"name": "조회용", "mode": "real", "market": "all", "account": acct[:8], "product": acct[8:10] or "01",
                      "app_key": env("KIS_APP_KEY"), "app_secret": env("KIS_APP_SECRET")}]
    yaml.safe_dump(k, open("trading/config/kis_devlp.yaml", "w"), allow_unicode=True, sort_keys=False)
print("설정 완료:", market)
