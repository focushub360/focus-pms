# Phase 2: archive/restore/delete, 7 core KPIs + 100% weights, monthly scorecard approval workflow.
# Runs sequentially (single class, shared state). Uses LIVE data carefully:
#  - Kriti's existing 2026-11 scorecard is cycled and left in REOPENED (its initial state).
#  - Manual KPI actual re-submitted with the SAME existing value (no net change).
#  - Manoj core weights set by Kiran for self-submit test, then restored to null via DB in teardown.
#  - Throwaway user phase2.tmp@focusengineering.in created, archived/restored, deleted.
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
MONTH = "2026-11"
KRITI_SC = "5c6a4a37-4caa-4f23-9b63-459e2171bf19"
STATE = {}


def mint(email):
    return subprocess.check_output([sys.executable, str(MINT_SCRIPT), email], cwd=str(BASE_DIR / "backend")).decode().strip()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tok():
    return {k: mint(e) for k, e in [("kiran", "kiran@focusengineering.in"), ("manoj", "manoj.mohan@focusengineering.in"),
                                    ("kriti", "kriti.singh@focusengineering.in")]}


@pytest.fixture(scope="module")
def ids(tok):
    users = requests.get(f"{API}/users", headers=H(tok["kiran"])).json()
    m = {u["email"]: u for u in users}
    return {"kiran": m["kiran@focusengineering.in"]["id"], "manoj": m["manoj.mohan@focusengineering.in"]["id"],
            "kriti": m["kriti.singh@focusengineering.in"]["id"], "users": users}


class TestPhase2:
    # ---- approver routing ----
    def test_approver_settings(self, tok):
        d = requests.get(f"{API}/settings/scorecard-approvers", headers=H(tok["kriti"])).json()
        assert d["hod"]["name"] == "Manoj Mohan"
        assert d["hod_approver"]["name"].startswith("Kiran")

    def test_self_routing(self, tok):
        for k, exp in [("kiran", "Manoj"), ("kriti", "Manoj"), ("manoj", "Kiran")]:
            r = requests.get(f"{API}/scorecards/monthly", headers=H(tok[k]))
            assert r.status_code == 200
            assert r.json()["approver"]["name"].startswith(exp), (k, r.json()["approver"])

    # ---- core KPIs ----
    def test_every_contributor_has_7_core(self, tok, ids):
        for u in ids["users"]:
            if u.get("is_active", True) and u.get("is_sales_contributor") and not u.get("is_test") and not u.get("is_duplicate"):
                cs = requests.get(f"{API}/kpi/core-status/{u['id']}", headers=H(tok["kiran"])).json()
                assert cs["core_count"] == 7, (u["email"], cs)

    def test_scorecard_is_core_and_overall(self, tok, ids):
        sc = requests.get(f"{API}/kpi/scorecard/{ids['kriti']}", headers=H(tok["manoj"])).json()
        core = [i for i in sc["items"] if i["is_core"]]
        assert len(core) == 7
        assert all("is_core" in i for i in sc["items"])
        opt_contrib = [i for i in sc["items"] if not i["is_core"] and i["weighted_score"] is not None]
        assert not opt_contrib, "optional items contributed to weighted score"
        ws = [i for i in core if i["weighted_score"] is not None]
        if ws:
            exp = round(sum(i["weighted_score"] for i in ws) / sum(i["weightage"] for i in ws) * 100, 2)
            assert abs(sc["overall_score"] - exp) < 0.05
        STATE["kriti_core"] = core
        manual = [i for i in core if i["data_source"] != "SYSTEM"]
        assert manual, "no manual core KPI for Kriti"
        STATE["kriti_manual"] = manual[0]

    def test_core_weights_validation(self, tok, ids):
        kc = STATE["kriti_core"]
        cur = {i["assignment_id"]: i["weightage"] for i in kc}
        url = f"{API}/kpi/core-weights/{ids['kriti']}"
        bad = dict(cur); k0 = next(iter(bad)); bad[k0] = bad[k0] + 5
        r = requests.put(url, headers=H(tok["manoj"]), json={"weights": bad, "reason": "TEST_validation"})
        assert r.status_code == 400 and "100" in r.json()["detail"]
        missing = dict(list(cur.items())[:6])
        assert requests.put(url, headers=H(tok["manoj"]), json={"weights": missing, "reason": "TEST_v"}).status_code == 400
        extra = {**cur, "bogus-id": 1}
        assert requests.put(url, headers=H(tok["manoj"]), json={"weights": extra, "reason": "TEST_v"}).status_code == 400
        # self
        r = requests.put(f"{API}/kpi/core-weights/{ids['manoj']}", headers=H(tok["manoj"]), json={"weights": {}, "reason": "TEST_v"})
        assert r.status_code == 403
        # valid 100 (re-apply current weights -> no net change)
        r = requests.put(url, headers=H(tok["manoj"]), json={"weights": cur, "reason": "TEST_reapply same weights"})
        assert r.status_code == 200, r.text
        assert r.json()["valid"] is True and r.json()["total_weightage"] == 100

    # ---- monthly scorecard: Kriti -> Manoj ----
    def test_submit_guards(self, tok):
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["kriti"]), json={"month": "2026-12"})
        assert r.status_code == 400 and "future" in r.json()["detail"]
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["manoj"]), json={"month": MONTH})
        assert r.status_code == 400 and "core" in r.json()["detail"].lower()  # Manoj weights not yet set

    def test_kriti_submit_and_duplicate(self, tok):
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["kriti"]), json={"month": MONTH, "comment": "TEST_submit"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == KRITI_SC and d["status"] == "SUBMITTED" and d["approver_name"] == "Manoj Mohan"
        assert len(d["items"]) == 7 and all(i["is_core"] for i in d["items"])
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["kriti"]), json={"month": MONTH})
        assert r.status_code == 400

    def test_queue_and_authority(self, tok):
        q = requests.get(f"{API}/scorecards/monthly/queue", headers=H(tok["manoj"])).json()
        assert any(s["id"] == KRITI_SC for s in q)
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/approve", headers=H(tok["kiran"]), json={}).status_code == 403
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/approve", headers=H(tok["kriti"]), json={}).status_code == 403

    def test_reject_requires_reason_then_resubmit(self, tok):
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reject", headers=H(tok["manoj"]), json={"comment": ""}).status_code == 400
        r = requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reject", headers=H(tok["manoj"]), json={"comment": "TEST_reject reason"})
        assert r.status_code == 200 and r.json()["status"] == "REJECTED"
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reopen", headers=H(tok["manoj"]), json={"comment": "TEST_x"}).status_code == 400
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["kriti"]), json={"month": MONTH, "comment": "TEST_resubmit"})
        assert r.status_code == 200 and r.json()["status"] == "SUBMITTED"

    def test_lock_while_submitted(self, tok):
        m = STATE["kriti_manual"]
        val = m["actual"] if m["actual"] is not None else 0
        r = requests.post(f"{API}/kpi/assignments/{m['assignment_id']}/actual", headers=H(tok["kriti"]),
                          json={"actual_value": val, "note": "TEST_lock"})
        assert r.status_code == 400 and "locked" in r.json()["detail"]

    def test_approve_and_lock(self, tok):
        r = requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/approve", headers=H(tok["manoj"]), json={"comment": "TEST_ok"})
        assert r.status_code == 200 and r.json()["status"] == "APPROVED"
        m = STATE["kriti_manual"]
        val = m["actual"] if m["actual"] is not None else 0
        r = requests.post(f"{API}/kpi/assignments/{m['assignment_id']}/actual", headers=H(tok["kriti"]),
                          json={"actual_value": val, "period": MONTH, "note": "TEST_lock"})
        assert r.status_code == 400

    def test_lock_bypass_with_other_period(self, tok):
        # Same value is re-sent; if accepted, FY-level actual_value can be changed while month is locked.
        m = STATE["kriti_manual"]
        val = m["actual"] if m["actual"] is not None else 0
        r = requests.post(f"{API}/kpi/assignments/{m['assignment_id']}/actual", headers=H(tok["kriti"]),
                          json={"actual_value": val, "period": "2026-10", "note": "TEST_bypass probe"})
        STATE["bypass_status"] = r.status_code
        assert r.status_code == 400, "Lock bypassed by passing a different period"

    def test_reopen(self, tok):
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reopen", headers=H(tok["manoj"]), json={"comment": "x"}).status_code == 400
        assert requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reopen", headers=H(tok["kiran"]), json={"comment": "TEST_kiran"}).status_code == 403
        r = requests.post(f"{API}/scorecards/monthly/{KRITI_SC}/reopen", headers=H(tok["manoj"]), json={"comment": "TEST_reopen reason"})
        assert r.status_code == 200 and r.json()["status"] == "REOPENED"
        m = STATE["kriti_manual"]
        val = m["actual"] if m["actual"] is not None else 0
        r = requests.post(f"{API}/kpi/assignments/{m['assignment_id']}/actual", headers=H(tok["kriti"]),
                          json={"actual_value": val, "note": "TEST_after reopen same value"})
        assert r.status_code == 200, r.text

    # ---- Manoj (HOD) -> Kiran ----
    def test_manoj_self_submit_to_kiran(self, tok, ids):
        cs = requests.get(f"{API}/kpi/core-status/{ids['manoj']}", headers=H(tok["kiran"])).json()
        sc = requests.get(f"{API}/kpi/scorecard/{ids['manoj']}", headers=H(tok["kiran"])).json()
        core = [i["assignment_id"] for i in sc["items"] if i["is_core"]]
        assert len(core) == 7
        STATE["manoj_core"] = core
        w = {a: 14 for a in core[:6]}; w[core[6]] = 16
        r = requests.put(f"{API}/kpi/core-weights/{ids['manoj']}", headers=H(tok["kiran"]), json={"weights": w, "reason": "TEST_temp weights"})
        assert r.status_code == 200, r.text
        r = requests.post(f"{API}/scorecards/monthly/submit", headers=H(tok["manoj"]), json={"month": MONTH, "comment": "TEST_hod"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]; STATE["manoj_sc"] = sid
        print("CREATED monthly_scorecard", sid)
        assert r.json()["approver_name"].startswith("Kiran")
        assert requests.post(f"{API}/scorecards/monthly/{sid}/approve", headers=H(tok["manoj"]), json={}).status_code == 403
        q = requests.get(f"{API}/scorecards/monthly/queue", headers=H(tok["kiran"])).json()
        assert any(s["id"] == sid for s in q)
        r = requests.post(f"{API}/scorecards/monthly/{sid}/approve", headers=H(tok["kiran"]), json={"comment": "TEST_ok"})
        assert r.status_code == 200 and r.json()["status"] == "APPROVED"

    # ---- audit ----
    def test_audit_actions(self, tok):
        logs = requests.get(f"{API}/audit-logs?limit=500", headers=H(tok["kiran"])).json()
        acts = {l["action"] for l in logs}
        for a in ["SCORECARD_SUBMITTED", "SCORECARD_APPROVED", "SCORECARD_REJECTED", "SCORECARD_REOPENED", "KPI_CORE_WEIGHTS_SET"]:
            assert a in acts, a

    # ---- archive / restore / delete (throwaway only) ----
    def test_archive_restore_delete(self, tok, ids):
        email = "phase2.tmp@focusengineering.in"
        r = requests.post(f"{API}/users", headers=H(tok["kiran"]), json={
            "name": "TEST_Phase2 Tmp", "email": email, "designation": "TEST", "is_sales_contributor": False,
            "sales_target_eligible": False, "activity_kpi_eligible": False})
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]; STATE["tmp_uid"] = uid
        u = f"{API}/users/{uid}"
        assert requests.post(f"{u}/archive", headers=H(tok["kiran"]), json={"reason": "x"}).status_code == 422
        assert requests.post(f"{u}/archive", headers=H(tok["manoj"]), json={"reason": "TEST_m"}).status_code == 403
        r = requests.post(f"{u}/archive", headers=H(tok["kiran"]), json={"reason": "TEST_archive"})
        assert r.status_code == 200 and r.json()["is_archived"] is True and r.json()["is_active"] is False
        assert requests.post(f"{u}/archive", headers=H(tok["kiran"]), json={"reason": "TEST_again"}).status_code == 400
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "whatever123"}).status_code == 401
        tmp_tok = mint(email)
        assert requests.get(f"{API}/auth/me", headers=H(tmp_tok)).status_code in (401, 403)
        r = requests.post(f"{u}/restore", headers=H(tok["kiran"]), json={"reason": "TEST_restore"})
        assert r.status_code == 200 and r.json()["is_active"] is True and r.json()["is_archived"] is False
        assert len(r.json()["status_history"]) >= 3
        # self / super admin
        assert requests.post(f"{API}/users/{ids['kiran']}/archive", headers=H(tok["kiran"]), json={"reason": "TEST_self"}).status_code == 403
        # delete
        dc = requests.get(f"{u}/delete-check", headers=H(tok["kiran"])).json()
        assert dc["has_history"] is False, dc
        assert requests.post(f"{u}/delete", headers=H(tok["manoj"]), json={"confirm_email": email, "reason": "TEST_d"}).status_code == 403
        assert requests.post(f"{u}/delete", headers=H(tok["kiran"]), json={"confirm_email": "wrong@x.com", "reason": "TEST_d"}).status_code == 400
        r = requests.post(f"{u}/delete", headers=H(tok["kiran"]), json={"confirm_email": email.upper(), "reason": "TEST_delete"})
        assert r.status_code == 200, r.text
        users = requests.get(f"{API}/users", headers=H(tok["kiran"])).json()
        assert not any(x["id"] == uid for x in users)
        logs = requests.get(f"{API}/audit-logs?limit=100", headers=H(tok["kiran"])).json()
        acts = {l["action"] for l in logs if l.get("record_id") == uid}
        assert {"USER_ARCHIVED", "USER_RESTORED", "USER_DELETED"} <= acts

    def test_delete_check_real_user_has_history(self, tok, ids):
        dc = requests.get(f"{API}/users/{ids['kriti']}/delete-check", headers=H(tok["kiran"])).json()
        assert dc["has_history"] is True
