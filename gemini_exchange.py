#!/usr/bin/env python3
"""Muse <-> Gemini exchange for the Blindrise AI hub (Phase C).

Sends ONE bounded prompt to the Gemini Developer API using the stored
`custom.gemini` credential (authd surrogate -- never the raw key) and
returns the model's text. Text generation on gemini-2.5-flash.

Usage:
  gemini_exchange.py ask --prompt "..." [--model gemini-2.5-flash]
                         [--max-tokens 2048] [--file OUT.md]

Cost note: text calls are fractions of a cent at Flash rates, but they
are NOT free. Owner-approved monthly cap: see STATUS.json / Phase C
record. Do not batch or loop without explicit owner approval.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import (  # noqa: E402
    read_json_response,
    url_with_surrogate_query_param,
)

HOSTS = ["generativelanguage.googleapis.com"]
CRED = "custom.gemini"
BASE = "https://generativelanguage.googleapis.com/v1beta"


def ask(prompt: str, model: str, max_tokens: int) -> str:
    url = url_with_surrogate_query_param(
        f"{BASE}/models/{model}:generateContent", CRED, allowed_hosts=HOSTS
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.4},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = read_json_response(resp)
    cands = body.get("candidates") or []
    if not cands:
        raise RuntimeError("no candidates in response: " + json.dumps(body)[:400])
    parts = (cands[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        raise RuntimeError("empty text in response: " + json.dumps(body)[:400])
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("ask")
    a.add_argument("--prompt", required=True)
    a.add_argument("--model", default="gemini-2.5-flash")
    a.add_argument("--max-tokens", type=int, default=2048)
    a.add_argument("--file", default=None, help="also write the reply to this file")
    args = ap.parse_args()
    text = ask(args.prompt, args.model, args.max_tokens)
    if args.file:
        with open(args.file, "w", encoding="utf-8") as f:
            f.write(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
