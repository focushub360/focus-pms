# Focus PMS iteration-3 retest: self-validation/self-edit/self-approve blocks, ge=0 actual, search excl is_test, dept opportunity-level win rate
import json
import os
import subprocess

import pytest
import requests

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MINT_SCRIPT = BASE_DIR / "scripts" / "mint_token.py"
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_file = BASE_DIR / "frontend" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8000"
API = f"{BASE_URL}/api"
IDS_FILE = str(BASE_DIR / "backend" / "test_ids.json")
EMAILS = {"kiran": "kiran@focusengineering.in", "manoj": "manoj.mohan@focusengineering.in", "dj": "dj.sir@focusengineering.in",
          "vijay": "vijaydevadas@focusengineering.in", "kriti": "kriti.singh@focusengineering.in",
          "mounika": "mounika.naidu@focusengineering.in"}


def _mint(email):
    return subprocess.check_output([sys.executable, str(MINT_SCRIPT), email], cwd=str(BASE_DIR / "backend")).decode().strip().splitlines()[-1]


def _record(kind, val):
    d = json.load(open(IDS_FILE)) if os.path.exists(IDS_FILE) else {}
    d.setdefault(kind, []).append(val)
    json.dump(d, open(IDS_FILE, "w"))


@pytest.fixture(scope="module")
def S():
    out = {}
    for k, e in EMAILS.items():
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {_mint(e)}", "Content-Type": "application/json"})
        out[k] = s
    return out


@pytest.fixture(scope="module")
def U(S):
    return {k: S[k].get(f"{API}/auth/me").json()["id"] for k in S}


def _assign(S, who_session, uid, code=None, manual=True):
    lst = who_session.get(f"{API}/kpi/assignments", params={"user_id": uid}).json()
    if code:
        return [a for a in lst if a["kpi_code"] == code][0]
    return [a for a in lst if a.get("data_source") != "SYSTEM"][0]


class TestIter3:
    # Self validation blocked; other's validation works; negative actual 422
    def test_validate_self_and_other(self, S, U):
        own = _assign(S, S["manoj"], U["manoj"])
        _record("actual_assignments", own["id"])
        r = S["manoj"].post(f"{API}/kpi/assignments/{own['id']}/actual", json={"actual_value": 3, "note": "ZZTEST"})
        assert r.status_code == 200 and r.json()["actual_status"] == "SUBMITTED", r.text
        v = S["manoj"].post(f"{API}/kpi/assignments/{own['id']}/validate")
        assert v.status_code == 403, v.text
        vij = _assign(S, S["vijay"], U["vijay"], "MIS_ACC")
        _record("actual_assignments", vij["id"])
        neg = S["vijay"].post(f"{API}/kpi/assignments/{vij['id']}/actual", json={"actual_value": -1})
        assert neg.status_code == 422, neg.text
        ok = S["vijay"].post(f"{API}/kpi/assignments/{vij['id']}/actual", json={"actual_value": 50, "note": "ZZTEST"})
        assert ok.status_code == 200 and ok.json()["actual_status"] == "SUBMITTED"
        v2 = S["manoj"].post(f"{API}/kpi/assignments/{vij['id']}/validate")
        assert v2.status_code == 200, v2.text
        got = _assign(S, S["vijay"], U["vijay"], "MIS_ACC")
        assert got["actual_status"] == "VALIDATED" and got["validated_by"] == U["manoj"]
        neg2 = S["manoj"].post(f"{API}/kpi/assignments/{vij['id']}/actual", json={"actual_value": -0.5})
        assert neg2.status_code == 422

    # PATCH own assignment blocked (Manoj, Kiran super admin); other's works
    def test_patch_self_blocked(self, S, U):
        m = _assign(S, S["manoj"], U["manoj"])
        r = S["manoj"].patch(f"{API}/kpi/assignments/{m['id']}", json={"target_value": 10, "reason": "ZZTEST"})
        assert r.status_code == 403, r.text
        k = _assign(S, S["kiran"], U["kiran"])
        r2 = S["kiran"].patch(f"{API}/kpi/assignments/{k['id']}", json={"weightage": 10, "reason": "ZZTEST"})
        assert r2.status_code == 403, r2.text
        assert _assign(S, S["kiran"], U["kiran"], k["kpi_code"])["weightage"] is None
        mk = _assign(S, S["manoj"], U["kiran"], k["kpi_code"])
        _record("patched_assignments", mk["id"])
        r3 = S["manoj"].patch(f"{API}/kpi/assignments/{mk['id']}", json={"target_value": 12, "weightage": 5, "reason": "ZZTEST other"})
        assert r3.status_code == 200, r3.text
        g = _assign(S, S["kiran"], U["kiran"], k["kpi_code"])
        assert g["target_value"] == 12 and g["weightage"] == 5

    # Target revision self-approve/reject blocked even for super admin; DJ can approve
    def test_revision_self_decide(self, S, U):
        tg = S["kiran"].get(f"{API}/targets").json()
        prev = [t for t in tg if t["user_id"] == U["kiran"]][0]["sales_target_inr"]
        assert prev == 500000
        r = S["manoj"].post(f"{API}/targets/revisions", json={"user_id": U["kiran"], "sales_target_inr": 600000, "reason": "ZZTEST kiran"})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]; _record("revisions", rid)
        a = S["kiran"].post(f"{API}/targets/revisions/{rid}/approve", json={"comment": "self"})
        assert a.status_code == 403, a.text
        rj = S["kiran"].post(f"{API}/targets/revisions/{rid}/reject", json={"comment": "self"})
        assert rj.status_code == 403, rj.text
        ok = S["dj"].post(f"{API}/targets/revisions/{rid}/approve", json={"comment": "ZZTEST"})
        assert ok.status_code == 200 and ok.json()["status"] == "APPROVED"
        tg = S["kiran"].get(f"{API}/targets").json()
        assert [t for t in tg if t["user_id"] == U["kiran"]][0]["sales_target_inr"] == 600000

    # Search excludes is_test and duplicates
    def test_search_excludes_test(self, S):
        users = S["kiran"].get(f"{API}/users").json()
        bad = {u["id"] for u in users if u.get("is_test") or u.get("is_duplicate")}
        assert len(bad) == 3
        for q in ("test", "Test User", "testuser1b", "vijay", "kabir", "focusengineering"):
            r = S["kiran"].get(f"{API}/search", params={"q": q}).json()
            ids = {u["id"] for u in r["users"]}
            assert not bad & ids, (q, r["users"])
        r = S["kiran"].get(f"{API}/search", params={"q": "vijaydevadas"}).json()
        assert len(r["users"]) == 1

    # Department won/lost/win rate are opportunity-level
    def test_dept_opportunity_level(self, S, U):
        before = S["manoj"].get(f"{API}/dashboard/department").json()
        body = {"title": "ZZTEST Split Won", "account_name": "ZZTEST Account", "stage": "Qualified", "value_inr": 10000,
                "probability": 50, "primary_owner_id": U["kriti"],
                "contributors": [{"user_id": U["kriti"], "credit_pct": 60}, {"user_id": U["mounika"], "credit_pct": 40}]}
        r = S["kiran"].post(f"{API}/opportunities", json=body)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]; _record("opps", oid)
        w = S["kiran"].patch(f"{API}/opportunities/{oid}", json={**body, "stage": "Won"})
        assert w.status_code == 200, w.text
        after = S["manoj"].get(f"{API}/dashboard/department").json()
        assert after["won_count"] - before["won_count"] == 1, (before["won_count"], after["won_count"])
        assert after["win_rate_pct"] == round(after["won_count"] / (after["won_count"] + after["lost_count"]) * 100, 2)
        fw = {f["stage"]: f["count"] for f in after["funnel"]}; fb = {f["stage"]: f["count"] for f in before["funnel"]}
        assert fw["Won"] - fb["Won"] == 1
        TestIter3.oid = oid

    # Funnel / lost list exclude opportunities owned by test/duplicate user
    def test_dept_excludes_test_owner(self, S, U):
        users = S["kiran"].get(f"{API}/users").json()
        tid = [u["id"] for u in users if u["email"] == "testuser1b@focusengineering.in"][0]
        before = S["manoj"].get(f"{API}/dashboard/department").json()
        body = {"title": "ZZTEST TestOwner Lost", "account_name": "ZZTEST Account", "stage": "Qualified", "value_inr": 7777,
                "probability": 10, "primary_owner_id": tid, "contributors": [{"user_id": tid, "credit_pct": 100}]}
        r = S["kiran"].post(f"{API}/opportunities", json=body)
        if r.status_code != 200:
            pytest.skip(f"cannot create opp for test owner: {r.status_code} {r.text[:200]}")
        oid = r.json()["id"]; _record("opps", oid)
        S["kiran"].patch(f"{API}/opportunities/{oid}", json={**body, "stage": "Lost", "won_lost_reason": "ZZTEST", "lost_reason": "ZZTEST"})
        after = S["manoj"].get(f"{API}/dashboard/department").json()
        assert after["lost_count"] == before["lost_count"]
        assert not any(o["id"] == oid for o in after["lost_opportunities"])
        assert sum(f["count"] for f in after["funnel"]) == sum(f["count"] for f in before["funnel"])

    # Regression smoke
    def test_smoke(self, S, U):
        assert S["vijay"].get(f"{API}/dashboard/me").status_code == 200
        assert S["kiran"].get(f"{API}/dashboard/admin").status_code == 200
        assert S["manoj"].get(f"{API}/dashboard/department").status_code == 200
