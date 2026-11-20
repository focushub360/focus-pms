# Calendar & Activities + Daily Activity report workflow tests (iteration 5)
import os, subprocess, json, sys
from pathlib import Path
import pytest, requests

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MINT_SCRIPT = BASE_DIR / "scripts" / "mint_token.py"
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8000").rstrip("/")
CREATED = {"activities": [], "daily_reports": [], "daily_corrections": []}
TODAY = "2026-11-12"


def tok(email):
    return subprocess.check_output([sys.executable, str(MINT_SCRIPT), email], cwd=str(BASE_DIR / "backend")).decode().strip().splitlines()[-1]


def S(email):
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {tok(email)}"
    return s


@pytest.fixture(scope="module")
def u():
    return {k: S(f"{k}@focusengineering.in") for k in ["kriti.singh", "mounika.naidu", "manoj.mohan", "kiran"]}


@pytest.fixture(scope="module", autouse=True)
def dump():
    yield


def ids(s):
    return s.get(f"{BASE_URL}/api/auth/me").json()["id"]


# ---- Calendar ----
class TestCalendar:
    def test_privacy_and_permissions(self, u):
        k, m = u["kriti.singh"], u["mounika.naidu"]
        base = {"activity_type": "Meeting", "start_at": "2026-11-13T15:00:00+05:30", "end_at": "2026-11-13T15:30:00+05:30"}
        p = k.post(f"{BASE_URL}/api/calendar/events", json={**base, "title": "TEST_private", "visibility": "PRIVATE"}).json()
        t = k.post(f"{BASE_URL}/api/calendar/events", json={**base, "title": "TEST_team", "visibility": "TEAM"}).json()
        CREATED["activities"] += [p["id"], t["id"]]
        q = "start=2026-11-13&end=2026-11-13"
        ev = {e["id"]: e for e in m.get(f"{BASE_URL}/api/calendar/events?{q}&scope=team").json()}
        assert ev[p["id"]]["title"] == "Busy" and ev[p["id"]]["busy"] is True and "notes" not in ev[p["id"]]
        assert ev[t["id"]]["title"] == "TEST_team"
        for who in ["manoj.mohan", "kiran"]:
            ev = {e["id"]: e for e in u[who].get(f"{BASE_URL}/api/calendar/events?{q}&scope=team").json()}
            assert ev[p["id"]]["title"] == "TEST_private", who
        # mine scope for employee excludes colleague events
        mine = {e["id"] for e in m.get(f"{BASE_URL}/api/calendar/events?{q}&scope=mine").json()}
        assert p["id"] not in mine
        # HOD "mine" scope - should ideally only include own events
        hod_mine = {e["id"] for e in u["manoj.mohan"].get(f"{BASE_URL}/api/calendar/events?{q}&scope=mine").json()}
        print("HOD mine scope contains Kriti's private:", p["id"] in hod_mine)
        assert m.patch(f"{BASE_URL}/api/calendar/events/{p['id']}", json={**base, "title": "hack"}).status_code == 403
        assert m.delete(f"{BASE_URL}/api/calendar/events/{p['id']}").status_code == 403
        r = m.post(f"{BASE_URL}/api/calendar/events", json={**base, "title": "TEST_x", "assigned_to": ids(k)})
        assert r.status_code == 403
        # edit own, complete, delete completed -> 400
        r = k.patch(f"{BASE_URL}/api/calendar/events/{t['id']}", json={**base, "title": "TEST_team2", "visibility": "TEAM", "status": "Completed"})
        assert r.status_code == 200 and r.json()["status"] == "Completed"
        assert k.delete(f"{BASE_URL}/api/calendar/events/{t['id']}").status_code == 400
        assert k.delete(f"{BASE_URL}/api/calendar/events/{p['id']}").status_code == 200
        CREATED["activities"].remove(p["id"])
        assert k.post(f"{BASE_URL}/api/calendar/events", json={**base, "title": "TEST_bad", "end_at": "2026-11-13T14:00:00+05:30"}).status_code == 400

    def test_system_events(self, u):
        ev = u["mounika.naidu"].get(f"{BASE_URL}/api/calendar/events?start=2026-11-01&end=2026-11-30&scope=mine").json()
        sid = {e["id"] for e in ev if e.get("system")}
        assert "sys-dsm-2026-11-14" not in sid and "sys-dsm-2026-11-15" not in sid
        assert "sys-dsm-2026-11-13" in sid and "sys-dsm-2026-11-21" in sid
        assert "sys-fr-2026-11-02" in sid and "sys-fr-2026-11-16" in sid
        dsm = next(e for e in ev if e["id"] == "sys-dsm-2026-11-13")
        assert dsm["start_at"].startswith("2026-11-13T04:30")


# ---- Daily report ----
class TestDaily:
    def test_prefill_kriti(self, u):
        r = u["kriti.singh"].get(f"{BASE_URL}/api/daily-reports/day?date={TODAY}").json()
        assert r["system_counts"]["sales_calls"] >= 1
        assert r["editable"] is False  # approved

    def test_mounika_flow(self, u):
        m, h, k = u["mounika.naidu"], u["manoj.mohan"], u["kiran"]
        g = m.get(f"{BASE_URL}/api/daily-reports/day?date={TODAY}").json()
        assert g["editable"] is True and g["employee"]["name"]
        body = {"date": TODAY, "entries": [], "next_day_plan": ""}
        assert m.put(f"{BASE_URL}/api/daily-reports/day", json={**body, "manual_counts": {"sales_calls": 5}}).status_code == 400
        r = m.put(f"{BASE_URL}/api/daily-reports/day", json={**body, "manual_counts": {"site_visits": 2}})
        assert r.status_code == 200 and r.json()["status"] == "DRAFT"
        rid = r.json()["id"]; CREATED["daily_reports"].append(rid)
        assert m.post(f"{BASE_URL}/api/daily-reports/day/submit", json=body).status_code == 400
        ent = [{"description": "TEST_ called client", "category": "Sales Call", "outcome": "ok"}]
        assert m.post(f"{BASE_URL}/api/daily-reports/day/submit", json={**body, "entries": ent}).status_code == 400
        # attachments
        assert m.post(f"{BASE_URL}/api/daily-reports/{rid}/attachments", files={"file": ("TEST_a.txt", b"hello", "text/plain")}).status_code == 200
        assert m.post(f"{BASE_URL}/api/daily-reports/{rid}/attachments", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 400
        assert m.post(f"{BASE_URL}/api/daily-reports/{rid}/attachments", files={"file": ("big.pdf", b"0" * (10 * 1024 * 1024 + 10), "application/pdf")}).status_code == 400
        r = m.post(f"{BASE_URL}/api/daily-reports/day/submit", json={**body, "entries": ent, "next_day_plan": "TEST_ plan tomorrow", "manual_counts": {"site_visits": 2}})
        assert r.status_code == 200 and r.json()["status"] == "SUBMITTED"
        rep = r.json(); aid = rep["attachments"][0]["id"]
        assert rep["manual_counts"]["site_visits"] == 2
        for s in (m, h, k):
            d = s.get(f"{BASE_URL}/api/daily-reports/{rid}/attachments/{aid}")
            assert d.status_code == 200 and d.content == b"hello"
        assert u["kriti.singh"].get(f"{BASE_URL}/api/daily-reports/{rid}/attachments/{aid}").status_code == 404
        mid = ids(m)
        assert u["kriti.singh"].get(f"{BASE_URL}/api/daily-reports/day?date={TODAY}&user_id={mid}").status_code == 403
        assert k.get(f"{BASE_URL}/api/daily-reports/day?date={TODAY}&user_id={mid}").json()["can_review"] is False
        t = k.get(f"{BASE_URL}/api/daily-reports/team?date={TODAY}")
        assert t.status_code == 200 and t.json()["can_review"] is False
        assert m.get(f"{BASE_URL}/api/daily-reports/team").status_code == 403
        assert h.get(f"{BASE_URL}/api/daily-reports/team").json()["can_review"] is True
        assert k.post(f"{BASE_URL}/api/daily-reports/{rid}/approve", json={}).status_code == 403
        assert h.post(f"{BASE_URL}/api/daily-reports/{rid}/return", json={"comment": ""}).status_code == 400
        assert h.post(f"{BASE_URL}/api/daily-reports/{rid}/approve", json={"comment": "TEST_ ok"}).json()["status"] == "APPROVED"
        assert m.put(f"{BASE_URL}/api/daily-reports/day", json={**body, "entries": ent}).status_code == 400

    def test_lock_future_past(self, u):
        m = u["mounika.naidu"]
        assert m.put(f"{BASE_URL}/api/daily-reports/day", json={"date": "2026-11-13"}).status_code == 400
        r = m.put(f"{BASE_URL}/api/daily-reports/day", json={"date": "2026-11-10"})
        assert r.status_code == 400 and "Locked" in r.json()["detail"]

    def test_corrections_and_return(self, u):
        m, h, k = u["mounika.naidu"], u["manoj.mohan"], u["kiran"]
        assert m.post(f"{BASE_URL}/api/daily-reports/corrections", json={"date": "2026-11-10", "reason": "x"}).status_code == 422
        assert m.post(f"{BASE_URL}/api/daily-reports/corrections", json={"date": TODAY, "reason": "TEST_ need"}).status_code in (200, 400)
        c = m.post(f"{BASE_URL}/api/daily-reports/corrections", json={"date": "2026-11-10", "reason": "TEST_ forgot to submit"})
        assert c.status_code == 200; cid = c.json()["id"]; CREATED["daily_corrections"].append(cid)
        assert m.post(f"{BASE_URL}/api/daily-reports/corrections", json={"date": "2026-11-10", "reason": "TEST_ dup again"}).status_code == 400
        assert k.post(f"{BASE_URL}/api/daily-reports/corrections/{cid}/approve", json={}).status_code == 403
        assert h.post(f"{BASE_URL}/api/daily-reports/corrections/{cid}/approve", json={"comment": "TEST_"}).json()["status"] == "APPROVED"
        g = m.get(f"{BASE_URL}/api/daily-reports/day?date=2026-11-10").json()
        assert g["editable"] is True and "Correction" in g["lock_reason"]
        CREATED["daily_reports"].append(g["id"])
        ent = [{"description": "TEST_ late entry", "category": "Other"}]
        r = m.post(f"{BASE_URL}/api/daily-reports/day/submit", json={"date": "2026-11-10", "entries": ent, "next_day_plan": "TEST_ plan"})
        assert r.status_code == 200 and r.json()["corrected"] is True
        rid = r.json()["id"]
        # reject path
        c2 = m.post(f"{BASE_URL}/api/daily-reports/corrections", json={"date": "2026-11-09", "reason": "TEST_ second one"}).json()
        CREATED["daily_corrections"].append(c2["id"])
        assert h.post(f"{BASE_URL}/api/daily-reports/corrections/{c2['id']}/reject", json={"comment": ""}).status_code == 400
        assert h.post(f"{BASE_URL}/api/daily-reports/corrections/{c2['id']}/reject", json={"comment": "TEST_ no"}).json()["status"] == "REJECTED"
        # return -> resubmit -> approve -> owner edit should be locked
        assert h.post(f"{BASE_URL}/api/daily-reports/{rid}/return", json={"comment": "TEST_ add detail"}).json()["status"] == "RETURNED"
        assert m.post(f"{BASE_URL}/api/daily-reports/day/submit", json={"date": "2026-11-10", "entries": ent, "next_day_plan": "TEST_ plan2"}).status_code == 200
        assert h.post(f"{BASE_URL}/api/daily-reports/{rid}/approve", json={}).json()["status"] == "APPROVED"
        after = m.put(f"{BASE_URL}/api/daily-reports/day", json={"date": "2026-11-10", "entries": ent})
        print("PUT after approve within correction window:", after.status_code)
        assert after.status_code == 400, "Approved report still editable because correction_unlocked_until is not cleared on approve"


class TestRegression:
    def test_regression(self, u):
        k = u["kiran"]
        assert k.put(f"{BASE_URL}/api/settings/scorecard-approvers", json={}).status_code == 405
        assert k.get(f"{BASE_URL}/api/settings/scorecard-approvers").status_code == 200
