#!/usr/bin/env python3
"""CHASE HomePath — repeatable end-to-end smoke test against a DEPLOYED instance.

Usage:  BASE=http://178.105.21.227:8101 python3 deploy/e2e_smoke.py
Covers the member journey plus the Section 8 compliance gates.
Exits non-zero on any failure.
"""
import json
import os
import random
import sys
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8101")
PASSED, FAILED = [], []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(name, cond, detail=""):
    (PASSED if cond else FAILED).append(name)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))


def main():
    email = f"e2e_{random.randrange(10**9)}@example.test"

    # 1. Register — consent captured, plan + six tracks created
    s, reg = call("POST", "/api/auth/register", {
        "name": "E2E Member", "email": email, "phone": "5551230000",
        "password": "a-strong-password-1", "consent": {"terms": True, "dataNeverSold": True}})
    check("register 201", s == 201, f"{s} {reg}")
    tok = reg.get("accessToken")

    # 2. Plan home — six tracks, day count, 90-day rule visible
    s, planr = call("GET", "/api/plan", token=tok)
    plan = planr.get("plan", planr)
    tracks = plan.get("tracks", [])
    check("plan has six tracks", s == 200 and len(tracks) == 6, f"{s} {len(tracks)}")
    check("90-day rule exposed", plan.get("placement", {}).get("minDay") == 90 or plan.get("minPlacementDay") == 90
          or "90" in json.dumps(plan), json.dumps(plan)[:200])

    # 3. Credit pull — items split, score withheld pre-consultation
    s, pull = call("POST", "/api/credit/pull", token=tok)
    check("credit pull ok", s in (200, 201), f"{s}")
    s, credit = call("GET", "/api/credit", token=tok)
    body = json.dumps(credit)
    score = credit.get("score") or {}
    check("score withheld before consultation", s == 200 and score.get("withheld") is True, body[:200])
    disputable = credit.get("disputable", [])
    accurate = credit.get("accurate", [])
    check("items classified disputable/accurate", bool(disputable) and bool(accurate),
          f"{len(disputable)}/{len(accurate)}")

    # 4. Compliance: member-initiated dispute allowed; accurate item dispute blocked
    if disputable:
        s, _ = call("POST", f"/api/credit/items/{disputable[0]['id']}/dispute", {"method": "online"}, token=tok)
        check("member-initiated dispute accepted", s in (200, 201), f"{s}")
    if accurate:
        s, _ = call("POST", f"/api/credit/items/{accurate[0]['id']}/dispute", {"method": "online"}, token=tok)
        check("accurate-item dispute blocked", s == 403, f"{s}")

    # 5. Money — Plaid link (mock), sync, budgets
    s, _ = call("POST", "/api/money/link", {"publicToken": "e2e"}, token=tok)
    check("bank link", s in (200, 201), f"{s}")
    s, _ = call("POST", "/api/money/sync", token=tok)
    check("transaction sync", s in (200, 201), f"{s}")
    s, money = call("GET", "/api/money", token=tok)
    check("money view", s == 200 and money.get("linked") and "budgets" in money, f"{s}")

    # 6. Marketplace — source labels on every listing
    s, mkt = call("GET", "/api/marketplace/listings", token=tok)
    listings = mkt.get("listings", [])
    check("marketplace listings", s == 200 and len(listings) > 0, f"{s}")
    check("every listing source-labeled", all(l.get("source") and l.get("sourceLabel") for l in listings))

    # 7. AI agent — answers own-file questions, escalates rate questions
    s, ans = call("POST", "/api/agent/ask", {"question": "What day of my plan am I on?"}, token=tok)
    check("agent answers plan question", s == 200 and ans.get("escalated") is False, f"{s} {ans}")
    s, esc = call("POST", "/api/agent/ask", {"question": "What interest rate can I get?"}, token=tok)
    check("agent escalates rate question", s == 200 and esc.get("escalated") is True, f"{s} {esc}")

    # 8. Education — curriculum assigned with locks
    s, learn = call("GET", "/api/learn", token=tok)
    check("curriculum assigned", s == 200 and len(json.dumps(learn)) > 50, f"{s}")

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
