#!/usr/bin/env python3
"""GitHub Secrets → PRISM-INSIGHT 설정 파일. PRISM 체크아웃 폴더(cwd)에서 실행한다.
필수: OPENAI_API_KEY (Gemini 사용 시 gemini_proxy.py 가 프록시 접속 키를 넣어 줌) (한국 종목 시세는 기본으로 네이버 증권 사용 — KIS_APP_KEY·KIS_APP_SECRET·KIS_ACCOUNT 를 모두 넣으면 KIS 사용)
선택: PERPLEXITY_API_KEY 또는 TAVILY_API_KEY(뉴스·웹 검색), FIRECRAWL_API_KEY(기업 웹 정보)
"""
import os, sys, yaml
market = sys.argv[1]
env = lambda k: (os.environ.get(k) or "").strip()
missing = [k for k in ["OPENAI_API_KEY"] if not env(k)]
use_kis = market == "KR" and all(env(k) for k in ["KIS_APP_KEY", "KIS_APP_SECRET", "KIS_ACCOUNT"])
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
if env("OPENAI_BASE_URL"):  # Gemini 프록시 — mcp-agent 쪽 호출도 같은 주소로
    cfg.setdefault("openai", {})["base_url"] = env("OPENAI_BASE_URL")
yaml.safe_dump(cfg, open("mcp_agent.config.yaml", "w"), allow_unicode=True, sort_keys=False)

# .env
lines = ["PRISM_MARKET_DATA_SOURCES=kis", "PRISM_REPORT_DATA_SOURCES=kis", "PRISM_PARALLEL_REPORT=false"]
if not env("PERPLEXITY_API_KEY") and env("TAVILY_API_KEY"):
    lines += ["PRISM_WEB_SEARCH_PROVIDER=tavily", "TAVILY_API_KEY=" + env("TAVILY_API_KEY")]
if env("PERPLEXITY_API_KEY"): lines.append("PERPLEXITY_API_KEY=" + env("PERPLEXITY_API_KEY"))
if env("REPORT_MODEL"): lines.append("REPORT_MODEL=" + env("REPORT_MODEL"))
if env("OPENAI_BASE_URL"): lines += ["OPENAI_BASE_URL=" + env("OPENAI_BASE_URL"), "OPENAI_API_KEY=" + env("OPENAI_API_KEY")]
open(".env", "a").write("\n" + "\n".join(lines) + "\n")
if not env("PERPLEXITY_API_KEY") and not env("TAVILY_API_KEY"):
    print("참고: PERPLEXITY/TAVILY 키 없음 — 뉴스·웹 검색이 빠지거나 약해질 수 있습니다")

# trading/config/kis_devlp.yaml — 시세 조회 전용(자동매매 꺼짐)
if use_kis:
    k = yaml.safe_load(open("trading/config/kis_devlp.yaml.example"))
    acct = env("KIS_ACCOUNT").replace("-", "")
    k.update({"auto_trading": False, "default_mode": "real", "my_app": env("KIS_APP_KEY"), "my_sec": env("KIS_APP_SECRET"),
              "paper_app": env("KIS_APP_KEY"), "paper_sec": env("KIS_APP_SECRET"), "my_htsid": env("KIS_HTS_ID") or "none"})
    k["accounts"] = [{"name": "조회용", "mode": "real", "market": "all", "account": acct[:8], "product": acct[8:10] or "01",
                      "app_key": env("KIS_APP_KEY"), "app_secret": env("KIS_APP_SECRET")}]
    yaml.safe_dump(k, open("trading/config/kis_devlp.yaml", "w"), allow_unicode=True, sort_keys=False)
if market == "KR" and not use_kis:
    import subprocess
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "install_naver.py")], check=True)
    # 에이전트가 띄우는 시세 MCP 서버에도 네이버 소스를 쓰도록 알린다
    cfg = yaml.safe_load(open("mcp_agent.config.yaml"))
    cfg["mcp"]["servers"]["kospi_kosdaq"].setdefault("env", {})["PRISM_NAVER_SOURCE"] = "1"
    yaml.safe_dump(cfg, open("mcp_agent.config.yaml", "w"), allow_unicode=True, sort_keys=False)
    open(".env", "a").write("PRISM_NAVER_SOURCE=1\n")
    gh = os.environ.get("GITHUB_ENV")
    if gh: open(gh, "a").write("PRISM_NAVER_SOURCE=1\n")
print("설정 완료:", market, "(KIS)" if use_kis else "(네이버 증권)" if market == "KR" else "")
