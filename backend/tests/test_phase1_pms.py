# Focus PMS Phase 1 regression: data integrity, RBAC hardening, KPI library/scorecard, target workflow, dashboards, audit, search
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
IDS_FILE = str(BASE_DIR / "backend" / "test_ids_phase1.json")

EMAILS = {
    "kiran": "kiran@focusengineering.in", "manoj": "manoj.mohan@focusengineering.in", "dj": "dj.sir@focusengineering.in",
    "vijay": "vijaydevadas@focusengineering.in", "satvinder": "satvinder.kaur@focusengineering.in",
    "kabir": "sales@focusengineering.in", "kriti": "kriti.singh@focusengineering.in", "mounika": "mounika.naidu@focusengineering.in",
}


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
    me = {k: S[k].get(f"{API}/auth/me").json() for k in S}
    return {k: v["id"] for k, v in me.items()}


class TestPhase1:
    ctx = {}

    # ── Data integrity
    def test_users_flags(self, S):
        users = S["kiran"].get(f"{API}/users").json()
        by_email = {u["email"]: u for u in users}
        assert by_email["testuser1b@focusengineering.in"].get("is_test") is True
        assert by_email["vijay.devadas@focusengineering.in"].get("is_duplicate") is True
        assert by_email["kabir.baweja@focusengineering.in"].get("is_duplicate") is True

    def test_excluded_from_reporting(self, S):
        bad = {"testuser1b@focusengineering.in", "vijay.devadas@focusengineering.in", "kabir.baweja@focusengineering.in"}
        users = S["kiran"].get(f"{API}/users").json()
        bad_ids = {u["id"] for u in users if u["email"] in bad}
        dept = S["kiran"].get(f"{API}/dashboard/department").json()
        assert not bad_ids & {r["user_id"] for r in dept["rows"]}
        emps = S["kiran"].get(f"{API}/meta/employees").json()
        assert not bad_ids & {e["id"] for e in emps}

    # ── KPI library
    def test_kpi_library(self, S):
        d = S["vijay"].get(f"{API}/kpi/definitions").json()
        c = S["vijay"].get(f"{API}/kpi/categories").json()
        assert len(d) >= 85 and len(c) == 10

    def test_functional_scorecards(self, S, U):
        exp = {"vijay": "FUNC_MIS", "satvinder": "FUNC_MARKETING", "kabir": "FUNC_BD", "kriti": "FUNC_BD",
               "mounika": "FUNC_BD", "manoj": "FUNC_HOD", "kiran": "FUNC_OPS"}
        for who, cat in exp.items():
            r = S[who].get(f"{API}/kpi/scorecard/{U[who]}")
            assert r.status_code == 200, (who, r.text)
            items = r.json()["items"]
            assert any(i["category"] == cat for i in items), (who, cat)
        vij = S["vijay"].get(f"{API}/kpi/assignments", params={"user_id": U["vijay"]}).json()
        assert any(a["kpi_code"] == "MIS_ACC" for a in vij)
        assert all(a["target_value"] is None for a in vij)
        TestPhase1.ctx["vij_assign"] = {a["kpi_code"]: a["id"] for a in vij}

    # ── Security
    def test_security_403s(self, S, U):
        va = TestPhase1.ctx["vij_assign"]
        any_aid = va["MIS_ACC"]
        checks = [
            S["vijay"].post(f"{API}/targets/revisions", json={"user_id": U["kiran"], "sales_target_inr": 1, "reason": "ZZTEST hack"}),
            S["vijay"].patch(f"{API}/kpi/assignments/{any_aid}", json={"target_value": 1, "reason": "x"}),
            S["vijay"].patch(f"{API}/users/{U['vijay']}", json={"role_codes": ["SYSTEM_ADMINISTRATOR"]}),
            S["vijay"].get(f"{API}/kpi/scorecard/{U['kiran']}"),
            S["vijay"].get(f"{API}/dashboard/me", params={"user_id": U["kiran"]}),
            S["kabir"].post(f"{API}/kpi/assignments/{any_aid}/actual", json={"actual_value": 1}),
            S["manoj"].post(f"{API}/roles", json={"code": "ZZTEST_ROLE", "name": "ZZTEST", "permissions": []}),
        ]
        manoj_me = S["manoj"].get(f"{API}/auth/me").json()
        checks.append(S["manoj"].patch(f"{API}/users/{U['manoj']}", json={"role_codes": (manoj_me.get("role_codes") or []) + ["MIS_BUSINESS_ANALYST"]}))
        codes = [c.status_code for c in checks]
        assert all(c == 403 for c in codes), codes

    # ── Actuals
    def test_manual_actual_and_validate(self, S, U):
        va = TestPhase1.ctx["vij_assign"]
        r = S["vijay"].post(f"{API}/kpi/assignments/{va['MIS_ACC']}/actual", json={"actual_value": 90, "note": "ZZTEST"})
        assert r.status_code == 200, r.text
        assert r.json()["actual_status"] == "SUBMITTED" and r.json()["actual_value"] == 90
        _record("actual_assignments", va["MIS_ACC"])
        if "SP_CONF_SALES" in va:
            r2 = S["vijay"].post(f"{API}/kpi/assignments/{va['SP_CONF_SALES']}/actual", json={"actual_value": 5})
            assert r2.status_code == 400
        r3 = S["manoj"].post(f"{API}/kpi/assignments/{va['MIS_ACC']}/validate")
        assert r3.status_code == 200
        lst = S["vijay"].get(f"{API}/kpi/assignments", params={"user_id": U["vijay"]}).json()
        assert [a for a in lst if a["id"] == va["MIS_ACC"]][0]["actual_status"] == "VALIDATED"

    # ── Target workflow
    def test_target_revision_workflow(self, S, U):
        bad_sum = S["manoj"].post(f"{API}/targets/revisions", json={"user_id": U["kabir"], "sales_target_inr": 120000,
                                  "monthly_targets": {"2026-04": 10000}, "reason": "ZZTEST"})
        assert bad_sum.status_code == 400
        no_reason = S["manoj"].post(f"{API}/targets/revisions", json={"user_id": U["kabir"], "sales_target_inr": 120000})
        assert no_reason.status_code == 422
        r = S["manoj"].post(f"{API}/targets/revisions", json={"user_id": U["kabir"], "sales_target_inr": 240000,
                            "monthly_targets": {"2026-04": 120000, "2026-05": 120000}, "reason": "ZZTEST initial target"})
        assert r.status_code == 200, r.text
        rev = r.json(); _record("revisions", rev["id"]); _record("target_users", U["kabir"])
        assert rev["status"] == "PENDING"
        dup = S["manoj"].post(f"{API}/targets/revisions", json={"user_id": U["kabir"], "sales_target_inr": 1, "reason": "ZZTEST dup"})
        assert dup.status_code == 400
        # Manoj own revision submitted by Kiran
        r2 = S["kiran"].post(f"{API}/targets/revisions", json={"user_id": U["manoj"], "sales_target_inr": 300000, "reason": "ZZTEST manoj"})
        assert r2.status_code == 200
        _record("revisions", r2.json()["id"]); _record("target_users", U["manoj"])
        own = S["manoj"].post(f"{API}/targets/revisions/{r2.json()['id']}/approve", json={"comment": "self"})
        assert own.status_code == 403
        # Notifications for approver
        notes = S["dj"].get(f"{API}/notifications").json()
        assert any(n.get("type") == "APPROVAL" for n in notes)
        ap = S["dj"].post(f"{API}/targets/revisions/{rev['id']}/approve", json={"comment": "ZZTEST ok"})
        assert ap.status_code == 200 and ap.json()["status"] == "APPROVED"
        assert ap.json()["previous"]["sales_target_inr"] is None
        tg = S["kiran"].get(f"{API}/targets").json()
        assert any(t["user_id"] == U["kabir"] and t["sales_target_inr"] == 240000 for t in tg)
        dm = S["manoj"].get(f"{API}/dashboard/me", params={"user_id": U["kabir"]}).json()
        assert dm["metrics"]["target_inr"] == 240000
        rj = S["kiran"].post(f"{API}/targets/revisions/{r2.json()['id']}/reject", json={"comment": "ZZTEST reject"})
        assert rj.status_code == 200 and rj.json()["status"] == "REJECTED"

    # ── KPI assignment edit + thresholds
    def test_assignment_patch_and_scorecard(self, S, U):
        va = TestPhase1.ctx["vij_assign"]
        _record("patched_assignments", va["MIS_ACC"])
        r = S["manoj"].patch(f"{API}/kpi/assignments/{va['MIS_ACC']}", json={"target_value": 100, "weightage": 20, "reason": "ZZTEST"})
        assert r.status_code == 200 and r.json()["target_value"] == 100
        sc = S["vijay"].get(f"{API}/kpi/scorecard/{U['vijay']}").json()
        it = [i for i in sc["items"] if i["kpi_code"] == "MIS_ACC"][0]
        assert it["achievement_pct"] == 90.0 and it["status"] == "ON_TRACK" and it["weighted_score"] == 18.0
        bad = S["kiran"].put(f"{API}/settings/kpi-thresholds", json={"achieved": 70, "on_track": 80, "at_risk": 60})
        assert bad.status_code == 400
        ok = S["kiran"].put(f"{API}/settings/kpi-thresholds", json={"achieved": 90, "on_track": 80, "at_risk": 60})
        assert ok.status_code == 200
        sc = S["vijay"].get(f"{API}/kpi/scorecard/{U['vijay']}").json()
        assert [i for i in sc["items"] if i["kpi_code"] == "MIS_ACC"][0]["status"] == "ACHIEVED"
        S["kiran"].put(f"{API}/settings/kpi-thresholds", json={"achieved": 100, "on_track": 80, "at_risk": 60})

    # ── Dashboard calculations
    def test_kiran_dashboard(self, S):
        d = S["kiran"].get(f"{API}/dashboard/me").json()
        assert d["metrics"]["confirmed_won_inr"] == 100000
        assert d["metrics"]["target_inr"] == 500000 and d["metrics"]["achievement_pct"] == 20.0
        assert len(d["metrics"]["funnel"]) == 10
        dept = S["kiran"].get(f"{API}/dashboard/department").json()
        assert round(sum(r["confirmed_won_inr"] for r in dept["rows"]), 2) == dept["confirmed_won_inr"]
        assert dept["department_target_source"] == "SUM_OF_INDIVIDUAL"
        assert dept["department_target_inr"] == sum(r["target_inr"] or 0 for r in dept["rows"])
        TestPhase1.ctx["dept_won_before"] = dept["confirmed_won_inr"]

    def test_credit_split(self, S, U):
        body = {"title": "ZZTEST Split Opp", "account_name": "ZZTEST Account", "stage": "Qualified", "value_inr": 50000,
                "probability": 50, "primary_owner_id": U["kriti"],
                "contributors": [{"user_id": U["kriti"], "credit_pct": 60}, {"user_id": U["mounika"], "credit_pct": 40}]}
        bad = S["kiran"].post(f"{API}/opportunities", json={**body, "stage": "Prospecting"})
        assert bad.status_code == 400
        r = S["kiran"].post(f"{API}/opportunities", json=body)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]; _record("opps", oid)
        before = {k: S["kiran"].get(f"{API}/dashboard/me", params={"user_id": U[k]}).json()["metrics"]["confirmed_won_inr"] for k in ("kriti", "mounika")}
        w = S["kiran"].patch(f"{API}/opportunities/{oid}", json={**body, "stage": "Won",
                             "contributors": [{"user_id": U["kriti"], "credit_pct": 70}, {"user_id": U["mounika"], "credit_pct": 30}]})
        assert w.status_code == 200
        after = {k: S["kiran"].get(f"{API}/dashboard/me", params={"user_id": U[k]}).json()["metrics"]["confirmed_won_inr"] for k in ("kriti", "mounika")}
        assert after["kriti"] - before["kriti"] == 35000 and after["mounika"] - before["mounika"] == 15000
        dept = S["kiran"].get(f"{API}/dashboard/department").json()
        assert dept["confirmed_won_inr"] - TestPhase1.ctx["dept_won_before"] == 50000
        TestPhase1.ctx["oid"] = oid

    # ── Audit
    def test_audit_fields(self, S):
        r = S["kiran"].get(f"{API}/audit-logs")
        assert r.status_code == 200
        logs = r.json()
        logs = logs.get("items", logs) if isinstance(logs, dict) else logs
        need = ["TARGET_REVISION_SUBMITTED", "TARGET_REVISION_APPROVED", "KPI_TARGET_REVISED", "KPI_ACTUAL_UPDATED",
                "OPPORTUNITY_WON", "SALES_CREDIT_SPLIT_CHANGED"]
        for a in need:
            e = [x for x in logs if x["action"] == a]
            assert e, a
            x = e[0]
            assert x.get("module") and x.get("record_id") and "previous_value" in x and x.get("new_value") is not None, (a, x)

    # ── Search
    def test_search(self, S):
        r = S["kiran"].get(f"{API}/search", params={"q": "ZZTEST"}).json()
        assert set(r) == {"leads", "accounts", "opportunities", "users"}
        assert any(o["title"] == "ZZTEST Split Opp" for o in r["opportunities"])
        v = S["vijay"].get(f"{API}/search", params={"q": "ZZTEST"})
        assert v.status_code == 200

    def test_admin_dashboard(self, S):
        assert S["vijay"].get(f"{API}/dashboard/admin").status_code == 403
        a = S["kiran"].get(f"{API}/dashboard/admin").json()
        assert a["users"]["test"] == 1 and a["users"]["duplicates"] == 2
