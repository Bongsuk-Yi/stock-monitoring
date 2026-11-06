#!/usr/bin/env python3
"""Gemini 를 OpenAI(Responses API) 처럼 쓰게 해 주는 LiteLLM 프록시를 띄운다.

PRISM-INSIGHT 는 OpenAI 모델 이름(gpt-6-luna 등)으로 호출하므로, 프록시가 그 이름을 모두
GEMINI_MODEL 하나로 연결한다. 사용 가능한 모델은 키로 직접 조회해서 고른다.

환경 변수
  GEMINI_API_KEY   (필수) aistudio.google.com 에서 만든 키
  GEMINI_MODEL     (선택) 원하는 모델. 비우면 아래 PREFER 순서대로 쓸 수 있는 첫 모델
  GEMINI_FALLBACK  (선택) "0" 이면 원하는 모델이 없을 때 다른 모델로 바꾸지 않고 실패
"""
import json, os, secrets, subprocess, sys, time, urllib.request

PORT = 4000
# 높은 모델 우선(Pro) → 없으면 그다음
PREFER = ["gemini-4-argon", "gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro",
          "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"]

key = (os.environ.get("GEMINI_API_KEY") or "").strip()
if not key:
    print("::error::GitHub Secret GEMINI_API_KEY 가 없습니다 — 저장소 Settings → Secrets and variables → Actions 에 등록하세요.")
    sys.exit(1)
want = (os.environ.get("GEMINI_MODEL") or "").strip()


def available():
    names, token = set(), ""
    for _ in range(10):
        url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000" + (f"&pageToken={token}" if token else "")
        req = urllib.request.Request(url, headers={"x-goog-api-key": key})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            print(f"::error::Gemini 키 확인 실패 (HTTP {e.code}) — 키가 맞는지 확인하세요. {body}")
            sys.exit(1)
        for m in d.get("models", []):
            if "generateContent" in m.get("supportedGenerationMethods", []):
                names.add(m["name"].split("/", 1)[-1])
        token = d.get("nextPageToken")
        if not token:
            break
    return names


names = available()
if want and want in names:
    model = want
elif want and os.environ.get("GEMINI_FALLBACK") == "0":
    print(f"::error::모델 {want} 을(를) 이 키로 쓸 수 없습니다. 쓸 수 있는 Pro 모델: " + ", ".join(sorted(n for n in names if "pro" in n)))
    sys.exit(1)
else:
    model = next((m for m in PREFER if m in names), None) or next((n for n in sorted(names, reverse=True) if "pro" in n), None)
    if not model:
        print("::error::쓸 수 있는 Gemini 모델을 찾지 못했습니다: " + ", ".join(sorted(names))[:500])
        sys.exit(1)
    if want:
        print(f"::warning::요청한 모델 {want} 을(를) 쓸 수 없어 {model} 로 바꿨습니다")
print("사용 모델:", model)

# PRISM 이 부르는 모든 이름 → 하나의 Gemini 모델
cfg = [
    "model_list:",
    '  - model_name: "*"',
    "    litellm_params:",
    f"      model: gemini/{model}",
    "      api_key: os.environ/GEMINI_API_KEY",
    "litellm_settings:",
    "  drop_params: true",   # Gemini 가 모르는 OpenAI 전용 옵션(service_tier 등)은 버린다
    "  num_retries: 4",       # 잠깐의 429/503 은 다시 시도
    "  request_timeout: 900",
]
open("litellm.yaml", "w").write("\n".join(cfg) + "\n")

master = "sk-" + secrets.token_hex(24)   # 이번 실행에서만 쓰는 프록시 접속 키
log = open("litellm.log", "w")
proc = subprocess.Popen(["litellm", "--config", "litellm.yaml", "--port", str(PORT), "--host", "127.0.0.1"],
                        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                        env={**os.environ, "LITELLM_MASTER_KEY": master})
for _ in range(90):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health/liveliness", timeout=2)
        break
    except Exception:
        if proc.poll() is not None:
            print(open("litellm.log").read()[-3000:]); print("::error::LiteLLM 프록시가 시작되지 않았습니다"); sys.exit(1)
        time.sleep(1)
else:
    print("::error::LiteLLM 프록시 응답 없음"); sys.exit(1)

# 실제 한 번 호출해 연결 확인 (PRISM 이 쓰는 Responses API 형식 그대로)
req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/responses",
                             data=json.dumps({"model": "gpt-6-luna", "input": "Reply with the single word: OK"}).encode(),
                             headers={"Content-Type": "application/json", "Authorization": "Bearer " + master})
try:
    r = json.load(urllib.request.urlopen(req, timeout=180))
    text = "".join(c.get("text", "") for o in r.get("output", []) for c in (o.get("content") or []) if isinstance(c, dict))
    print("연결 확인:", text.strip()[:40] or "(응답 받음)")
except urllib.error.HTTPError as e:
    print(e.read().decode("utf-8", "replace")[:1500]); print("::error::Gemini 시험 호출 실패"); sys.exit(1)

gh = os.environ.get("GITHUB_ENV")
print(f"::add-mask::{master}")
if gh:
    with open(gh, "a") as f:
        f.write(f"OPENAI_BASE_URL=http://127.0.0.1:{PORT}/v1\nOPENAI_API_KEY={master}\nGEMINI_RESOLVED_MODEL={model}\n")
summ = os.environ.get("GITHUB_STEP_SUMMARY")
if summ:
    open(summ, "a").write(f"- AI 모델: **{model}** (Gemini)\n")
