"""End-to-end API & calculation verification for Command Center + Employee Monthly KPI Scorecard.
Runs completely in-memory against a MongoDB fake so production Atlas data is never touched.
Execute directly via: python backend/tests/test_command_center_and_monthly_kpis.py
"""
from __future__ import annotations

import asyncio
import copy
import re
import sys
import uuid
from pathlib import Path

import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import auth as auth_mod
import alerts_routes as alerts_mod
import core as core_mod
import command_center_routes as cc_mod
import dashboard_routes as dash_mod
import kpi_routes as kpi_mod
import monthly_kpi_routes as mkpi_mod
import phase2_routes as p2_mod
import reports_routes as rep_mod
import server as srv_mod
from kpi_catalog import KPI_CATEGORIES, KPI_DEFINITIONS, LOWER_IS_BETTER, SYSTEM_KPI_MAP, ALL_SALES
from permissions_catalog import PERMISSIONS, SEED_ROLES


# ────────────────────────── IN-MEMORY ASYNC MONGO FAKE ──────────────────────────
def _match(doc: dict, flt: dict) -> bool:
    if not flt:
        return True
    for k, v in flt.items():
        if k == "$or":
            if not any(_match(doc, sub) for sub in v):
                return False
            continue
        if k == "$and":
            if not all(_match(doc, sub) for sub in v):
                return False
            continue
        val = doc
        for part in k.split("."):
            val = val.get(part) if isinstance(val, dict) else None
        if isinstance(v, dict):
            for op, arg in v.items():
                if op == "$ne":
                    if val == arg:
                        return False
                elif op == "$in":
                    if isinstance(val, list):
                        if not set(val) & set(arg):
                            return False
                    elif val not in arg:
                        return False
                elif op == "$nin":
                    if isinstance(val, list):
                        if set(val) & set(arg):
                            return False
                    elif val in arg:
                        return False
                elif op == "$lt":
                    if val is None or not (val < arg):
                        return False
                elif op == "$lte":
                    if val is None or not (val <= arg):
                        return False
                elif op == "$gt":
                    if val is None or not (val > arg):
                        return False
                elif op == "$gte":
                    if val is None or not (val >= arg):
                        return False
                elif op == "$exists":
                    exists = k in doc
                    if exists != bool(arg):
                        return False
                elif op == "$regex":
                    flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                    if not isinstance(val, str) or not re.search(arg, val, flags):
                        return False
                elif op == "$options":
                    continue
        else:
            if isinstance(val, list):
                if v not in val:
                    return False
            elif val != v:
                return False
    return True


def _project(doc: dict, proj: dict | None) -> dict:
    out = copy.deepcopy(doc)
    if not proj:
        return out
    includes = [k for k, v in proj.items() if v == 1 and k != "_id"]
    if includes:
        res = {k: out[k] for k in includes if k in out}
        if proj.get("_id", 1) == 1 and "_id" in out:
            res["_id"] = out["_id"]
        return res
    for k, v in proj.items():
        if v == 0:
            out.pop(k, None)
    return out


class FakeCursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs
        self._idx = 0

    def sort(self, key, direction=1):
        pairs = key if isinstance(key, list) else [(key, direction)]
        for k, d in reversed(pairs):
            self._docs.sort(key=lambda x: (x.get(k) is None, str(x.get(k) or "")), reverse=(d == -1))
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        if self._idx >= len(self._docs):
            raise StopAsyncIteration
        d = self._docs[self._idx]
        self._idx += 1
        return d


class FakeCollection:
    def __init__(self):
        self.docs: list[dict] = []

    def find(self, flt=None, proj=None):
        matched = [_project(d, proj) for d in self.docs if _match(d, flt or {})]
        return FakeCursor(matched)

    async def find_one(self, flt=None, proj=None):
        for d in self.docs:
            if _match(d, flt or {}):
                return _project(d, proj)
        return None

    async def count_documents(self, flt=None):
        return sum(1 for d in self.docs if _match(d, flt or {}))

    async def insert_one(self, doc: dict):
        d = copy.deepcopy(doc)
        d.setdefault("_id", str(uuid.uuid4()))
        self.docs.append(d)
        return type("Res", (), {"inserted_id": d["_id"]})()

    async def update_one(self, flt: dict, upd: dict, upsert: bool = False):
        for d in self.docs:
            if _match(d, flt):
                if "$set" in upd:
                    d.update(copy.deepcopy(upd["$set"]))
                if "$push" in upd:
                    for k, v in upd["$push"].items():
                        d.setdefault(k, []).append(copy.deepcopy(v))
                return type("Res", (), {"matched_count": 1, "modified_count": 1})()
        if upsert:
            base = {k: v for k, v in flt.items() if not k.startswith("$")}
            if "$setOnInsert" in upd:
                base.update(copy.deepcopy(upd["$setOnInsert"]))
            if "$set" in upd:
                base.update(copy.deepcopy(upd["$set"]))
            base.setdefault("_id", str(uuid.uuid4()))
            self.docs.append(base)
            return type("Res", (), {"matched_count": 0, "modified_count": 1})()
        return type("Res", (), {"matched_count": 0, "modified_count": 0})()

    async def replace_one(self, flt: dict, doc: dict, upsert: bool = False):
        for i, d in enumerate(self.docs):
            if _match(d, flt):
                nd = copy.deepcopy(doc)
                nd["_id"] = d.get("_id", str(uuid.uuid4()))
                self.docs[i] = nd
                return type("Res", (), {"matched_count": 1})()
        if upsert:
            await self.insert_one(doc)
        return type("Res", (), {"matched_count": 0})()

    async def delete_one(self, flt: dict):
        for i, d in enumerate(self.docs):
            if _match(d, flt):
                self.docs.pop(i)
                return type("Res", (), {"deleted_count": 1})()
        return type("Res", (), {"deleted_count": 0})()

    async def delete_many(self, flt: dict):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _match(d, flt)]
        return type("Res", (), {"deleted_count": before - len(self.docs)})()


class FakeDB:
    def __init__(self):
        self._colls: dict[str, FakeCollection] = {}

    def __getattr__(self, name: str) -> FakeCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        if name not in self._colls:
            self._colls[name] = FakeCollection()
        return self._colls[name]

    def __getitem__(self, name: str) -> FakeCollection:
        return self.__getattr__(name)

    async def command(self, cmd: str):
        return {"ok": 1}


def install_fake_db() -> FakeDB:
    fake = FakeDB()
    for mod in (core_mod, auth_mod, alerts_mod, srv_mod, kpi_mod, dash_mod, p2_mod, cc_mod, mkpi_mod, rep_mod):
        if hasattr(mod, "db"):
            mod.db = fake
    auth_mod.set_db(fake)
    return fake


async def seed_fake(db: FakeDB) -> dict:
    for r in SEED_ROLES:
        await db.roles.insert_one({"id": str(uuid.uuid4()), **r})
    for code, label in KPI_CATEGORIES:
        await db.kpi_categories.insert_one({"code": code, "label": label})
    for code, name, cat, unit, formula, freq, roles in KPI_DEFINITIONS:
        await db.kpi_definitions.insert_one({
            "id": str(uuid.uuid4()), "code": code, "name": name, "category": cat,
            "unit": unit, "formula": formula, "frequency": freq,
            "applicable_roles": roles, "applies_to_all_sales": roles == ALL_SALES,
            "direction": "lower" if code in LOWER_IS_BETTER else "higher",
            "data_source": "SYSTEM" if code in SYSTEM_KPI_MAP else "MANUAL",
            "is_active": True,
        })
    await db.settings.insert_one({"key": "kpi_thresholds", "achieved": 100, "on_track": 80, "at_risk": 60})

    def perms_for(role_code: str):
        for r in SEED_ROLES:
            if r["code"] == role_code:
                return r["permissions"]
        return []

    users = {
        "dj": {
            "id": "u-dj", "name": "DJ Sir", "email": "dj.sir@focusengineering.in",
            "designation": "Management Board Member", "functional_responsibility": "Management Board",
            "role_codes": ["MANAGEMENT_BOARD"], "permissions": perms_for("MANAGEMENT_BOARD"),
            "data_visibility": "ALL", "is_active": True, "is_super_admin": False, "is_sales_contributor": False,
        },
        "manoj": {
            "id": "u-manoj", "name": "Manoj Mohan", "email": "manoj.mohan@focusengineering.in",
            "designation": "Head of Sales & Marketing", "functional_responsibility": "Head of Department",
            "role_codes": ["HEAD_OF_DEPARTMENT"], "permissions": perms_for("HEAD_OF_DEPARTMENT"),
            "data_visibility": "DEPARTMENT", "is_active": True, "is_super_admin": False, "is_sales_contributor": True,
        },
        "kriti": {
            "id": "u-kriti", "name": "Kriti Singh", "email": "kriti.singh@focusengineering.in",
            "designation": "Business Development", "functional_responsibility": "Business Development",
            "role_codes": ["SALES_MARKETING_CONTRIBUTOR"], "permissions": perms_for("SALES_MARKETING_CONTRIBUTOR"),
            "data_visibility": "OWN", "is_active": True, "is_super_admin": False, "is_sales_contributor": True,
        },
        "vijay": {
            "id": "u-vijay", "name": "Vijay Devadas", "email": "vijay.devadas@focusengineering.in",
            "designation": "Business Analysis & MIS", "functional_responsibility": "Business Analysis & MIS",
            "role_codes": ["MIS_BUSINESS_ANALYST"], "permissions": perms_for("MIS_BUSINESS_ANALYST"),
            "data_visibility": "OWN", "is_active": True, "is_super_admin": False, "is_sales_contributor": True,
        },
        "satvinder": {
            "id": "u-satvinder", "name": "Satvinder Kaur", "email": "satvinder.kaur@focusengineering.in",
            "designation": "Creative & Marketing", "functional_responsibility": "Creative & Marketing",
            "role_codes": ["MARKETING_MANAGER"], "permissions": perms_for("MARKETING_MANAGER"),
            "data_visibility": "OWN", "is_active": True, "is_super_admin": False, "is_sales_contributor": True,
        },
        "kiran": {
            "id": "u-kiran", "name": "Kiran Kulkarni", "email": "kiran@focusengineering.in",
            "designation": "Sales, Marketing & Operations", "functional_responsibility": "Operations & Process Coordination",
            "role_codes": ["SYSTEM_ADMINISTRATOR"], "permissions": list(PERMISSIONS.keys()),
            "data_visibility": "ALL", "is_active": True, "is_super_admin": True, "is_sales_contributor": True,
        },
    }
    for u in users.values():
        await db.users.insert_one(u)

    await db.targets.insert_one({
        "id": "t-dept", "user_id": "DEPARTMENT", "fy_code": "FY2026-27",
        "sales_target_inr": 24000000,
        "monthly_targets": {f"2026-{m:02d}": 2000000 for m in range(4, 13)} | {f"2027-{m:02d}": 2000000 for m in range(1, 4)},
    })
    return {k: auth_mod.create_access_token(v["id"]) for k, v in users.items()}


def H(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


async def run_tests():
    db = install_fake_db()
    tok = await seed_fake(db)

    transport = httpx.ASGITransport(app=srv_mod.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. RBAC: regular contributor blocked from Executive Command Center
        r = await client.get("/api/command-center/executive", headers=H(tok["kriti"]))
        assert r.status_code == 403, f"Expected 403 for contributor, got {r.status_code}"

        # 2. Create Hot / Warm / Cold Leads & PATCH temperature
        r1 = await client.post("/api/leads", headers=H(tok["kriti"]), json={
            "name": "Aarav Mehta", "company": "Apex Power", "temperature": "Hot",
            "estimated_value_inr": 1500000, "status": "Qualified", "owner_id": "u-kriti",
        })
        assert r1.status_code == 200, r1.text
        lead_hot = r1.json()
        assert lead_hot["temperature"] == "Hot"

        r2 = await client.post("/api/leads", headers=H(tok["kriti"]), json={
            "name": "Neha Rao", "company": "SolarGrid Ltd", "temperature": "Cold",
            "estimated_value_inr": 500000, "status": "New", "owner_id": "u-kriti",
        })
        assert r2.status_code == 200, r2.text
        r2p = await client.patch(f"/api/leads/{r2.json()['id']}", headers=H(tok["kriti"]), json={"temperature": "Warm"})
        assert r2p.status_code == 200 and r2p.json()["temperature"] == "Warm"

        # 3. Create Won Opportunity with Finance figures & Customer Meeting
        ro = await client.post("/api/opportunities", headers=H(tok["kriti"]), json={
            "title": "Substation Automation", "account_name": "Apex Power", "stage": "Won",
            "value_inr": 1200000, "invoiced_inr": 1000000, "collected_inr": 750000,
            "po_reference": "PO-APEX-2026", "primary_owner_id": "u-kriti",
            "contributors": [{"user_id": "u-kriti", "credit_pct": 100}],
        })
        assert ro.status_code == 200, ro.text
        opp_id = ro.json()["id"]

        await db.activities.insert_one({
            "id": str(uuid.uuid4()), "title": "Apex Technical Discovery",
            "activity_type": "Customer Meeting", "status": "Completed",
            "assigned_to": "u-kriti", "start_at": "2026-11-10T10:00:00+05:30",
        })

        # 4. Projects in Hand CRUD across Design -> Execution -> Commissioning
        rp = await client.post("/api/projects", headers=H(tok["manoj"]), json={
            "name": "Apex 33kV Switchgear", "client_name": "Apex Power", "stage": "Design",
            "contract_value_inr": 1200000, "invoiced_inr": 600000, "collected_inr": 400000,
            "progress_pct": 25, "opportunity_id": opp_id, "project_manager_id": "u-kiran",
            "start_date": "2026-11-05",
        })
        assert rp.status_code == 200, rp.text
        proj_id = rp.json()["id"]
        assert rp.json()["stage"] == "Design"

        rp_adv = await client.patch(f"/api/projects/{proj_id}", headers=H(tok["manoj"]), json={
            "stage": "Execution", "progress_pct": 55,
        })
        assert rp_adv.status_code == 200 and rp_adv.json()["stage"] == "Execution"

        # 5. Executive Command Center verification (Leadership DJ Sir)
        rcc = await client.get("/api/command-center/executive?fy_code=FY2026-27", headers=H(tok["dj"]))
        assert rcc.status_code == 200, rcc.text
        cc = rcc.json()
        assert cc["revenue_overview"]["total_revenue_inr"] == 1200000.0
        assert cc["revenue_overview"]["invoiced_inr"] == 600000.0
        assert cc["revenue_overview"]["collected_inr"] == 400000.0
        assert cc["sales_funnel"]["hot_leads"]["count"] == 1
        assert cc["sales_funnel"]["warm_leads"]["count"] == 1
        assert cc["sales_funnel"]["meetings"]["count"] == 1
        assert cc["sales_funnel"]["revenue_won"]["count"] == 1
        assert cc["projects_in_hand"]["active_projects"] == 1
        exec_stage = [s for s in cc["projects_in_hand"]["stages"] if s["stage"] == "Execution"][0]
        assert exec_stage["count"] == 1 and exec_stage["contract_value_inr"] == 1200000.0

        # 6. Monthly KPI Role Templates (Sales, Operations, EA/BA, Creative) per PRD v1.0
        rt = await client.get("/api/monthly-kpis/templates", headers=H(tok["kriti"]))
        assert rt.status_code == 200
        tpl_codes = {t["code"] for t in rt.json()}
        assert tpl_codes == {"SALES", "OPERATIONS", "EA_BA", "CREATIVE"}

        # Check Kiran -> OPERATIONS (5 regular + 4 optional), Vijay -> EA_BA (7 functional + 7 sales + 5 optional), Satvinder -> CREATIVE (7 creative + 7 sales + 7 optional)
        rkiran = await client.get("/api/monthly-kpis?month=2026-11&user_id=u-kiran", headers=H(tok["kiran"]))
        assert rkiran.status_code == 200 and rkiran.json()["template_code"] == "OPERATIONS"
        assert len([x for x in rkiran.json()["kpis"] if not x["is_optional"]]) == 5
        assert len([x for x in rkiran.json()["kpis"] if x["is_optional"]]) == 4

        rv = await client.get("/api/monthly-kpis?month=2026-11&user_id=u-vijay", headers=H(tok["vijay"]))
        assert rv.status_code == 200 and rv.json()["template_code"] == "EA_BA"
        assert len([x for x in rv.json()["kpis"] if x["kpi_group"] == "Functional"]) == 7
        assert len([x for x in rv.json()["kpis"] if x["kpi_group"] == "Sales & BD"]) == 7
        assert len([x for x in rv.json()["kpis"] if x["is_optional"]]) == 5

        rs = await client.get("/api/monthly-kpis?month=2026-11&user_id=u-satvinder", headers=H(tok["satvinder"]))
        assert rs.status_code == 200 and rs.json()["template_code"] == "CREATIVE"
        assert len([x for x in rs.json()["kpis"] if x["kpi_group"] == "Functional"]) == 7
        assert len([x for x in rs.json()["kpis"] if x["kpi_group"] == "Sales & BD"]) == 7
        assert len([x for x in rs.json()["kpis"] if x["is_optional"]]) == 7

        # 7. Kriti Monthly KPI Sheet: Separate Weekly Progress Log + Monthly Actuals + 120% Cap
        rk = await client.get("/api/monthly-kpis?month=2026-11", headers=H(tok["kriti"]))
        assert rk.status_code == 200
        ksheet = rk.json()
        assert ksheet["template_code"] == "SALES"
        assert ksheet["active_weight_total"] == 100.0

        # Log separate weekly progress (does NOT auto-sum into percentage KPIs)
        wlog = await client.post("/api/monthly-kpis/weekly-log", headers=H(tok["kriti"]), json={
            "month": "2026-11", "kpi_code": "SP_FU_COMP", "week_label": "Week 1", "progress_value": 92, "remarks": "W1 check",
        })
        assert wlog.status_code == 200, wlog.text
        wlogs = await client.get("/api/monthly-kpis/weekly-logs?month=2026-11&kpi_code=SP_FU_COMP", headers=H(tok["kriti"]))
        assert wlogs.status_code == 200 and len(wlogs.json()) == 1

        # Submit blocked when manual/missing actuals exist -> structured field errors
        rsub_missing = await client.post("/api/monthly-kpis/submit", headers=H(tok["kriti"]), json={"month": "2026-11"})
        assert rsub_missing.status_code == 400 and "errors" in rsub_missing.json()["detail"]

        # Enter monthly actuals (SP_PROP_CONV target=30%, weight=15%, actual=60% -> raw 200%, capped 120%, score=18.0)
        ra = await client.put("/api/monthly-kpis/actuals", headers=H(tok["kriti"]), json={
            "month": "2026-11",
            "entries": [
                {"kpi_code": "SP_NEW_LEADS", "actual": 20},
                {"kpi_code": "SP_QUAL_LEADS", "actual": 12},
                {"kpi_code": "SP_MEETINGS", "actual": 16},
                {"kpi_code": "SP_PROP_SUB", "actual": 6},
                {"kpi_code": "SP_FU_COMP", "actual": 95},
                {"kpi_code": "SP_PROP_CONV", "actual": 60},
                {"kpi_code": "SP_CONF_SALES", "actual": 1000000},
            ],
        })
        assert ra.status_code == 200, ra.text
        conv_row = [x for x in ra.json()["kpis"] if x["kpi_code"] == "SP_PROP_CONV"][0]
        assert conv_row["achievement_pct"] == 200.0
        assert conv_row["capped_achievement_pct"] == 120.0
        assert conv_row["weighted_score"] == 18.0
        assert conv_row["status"] == "On Track"

        # 8. Optional KPI activation/deactivation (excluded when Deactive, retains target/actual/weight)
        rcfg = await client.put("/api/monthly-kpis/config", headers=H(tok["kriti"]), json={
            "month": "2026-11",
            "items": [{"kpi_code": "PRJ_HANDOVER", "is_active": True}],
        })
        assert rcfg.status_code == 200
        # HOD sets 10% weight on PRJ_HANDOVER -> total becomes 110%, submit blocked
        await client.put("/api/monthly-kpis/config", headers=H(tok["manoj"]), json={
            "user_id": "u-kriti", "month": "2026-11",
            "items": [{"kpi_code": "PRJ_HANDOVER", "weight": 10}],
        })
        rsub_bad = await client.post("/api/monthly-kpis/submit", headers=H(tok["kriti"]), json={"month": "2026-11"})
        assert rsub_bad.status_code == 400 and "100%" in str(rsub_bad.json()["detail"])

        # Deactivate optional KPI -> weight retained as 10 on row, but excluded from 100% active total!
        rdeact = await client.put("/api/monthly-kpis/config", headers=H(tok["kriti"]), json={
            "month": "2026-11",
            "items": [{"kpi_code": "PRJ_HANDOVER", "is_active": False}],
        })
        assert rdeact.status_code == 200 and rdeact.json()["active_weight_total"] == 100.0
        prj_row = [x for x in rdeact.json()["kpis"] if x["kpi_code"] == "PRJ_HANDOVER"][0]
        assert prj_row["status"] == "Deactive" and prj_row["weight"] == 10.0

        # Toggle request workflow (employee requests regular KPI deactivation -> HOD declines)
        rtog = await client.post("/api/monthly-kpis/toggle-request", headers=H(tok["kriti"]), json={
            "month": "2026-11", "kpi_code": "SP_NEW_LEADS", "desired_active": False, "reason": "Test request",
        })
        assert rtog.status_code == 200
        rdec = await client.post(f"/api/monthly-kpis/toggle-requests/{rtog.json()['id']}/decide", headers=H(tok["manoj"]), json={
            "approve": False, "comment": "Keep active",
        })
        assert rdec.status_code == 200 and rdec.json()["status"] == "REJECTED"

        rsub = await client.post("/api/monthly-kpis/submit", headers=H(tok["kriti"]), json={"month": "2026-11"})
        assert rsub.status_code == 200, rsub.text
        sheet_id = rsub.json()["id"]
        assert rsub.json()["status"] == "SUBMITTED" and rsub.json()["locked"] is True

        # 9. Lock check while submitted
        rlock1 = await client.put("/api/monthly-kpis/actuals", headers=H(tok["kriti"]), json={
            "month": "2026-11", "entries": [{"kpi_code": "SP_NEW_LEADS", "actual": 1}],
        })
        assert rlock1.status_code == 400 and "locked" in rlock1.json()["detail"].lower()

        # 10. HOD Queue + Self-Approval Guard + Return for Correction + Resubmit + Approve & Lock
        rq = await client.get("/api/monthly-kpis/queue", headers=H(tok["manoj"]))
        assert rq.status_code == 200 and any(x["id"] == sheet_id for x in rq.json())

        assert (await client.post(f"/api/monthly-kpis/{sheet_id}/approve", headers=H(tok["kriti"]), json={})).status_code == 403

        rret = await client.post(f"/api/monthly-kpis/{sheet_id}/return", headers=H(tok["manoj"]), json={"comment": "Please verify proposals"})
        assert rret.status_code == 200 and rret.json()["status"] == "RETURNED" and rret.json()["locked"] is False

        rsub2 = await client.post("/api/monthly-kpis/submit", headers=H(tok["kriti"]), json={"month": "2026-11"})
        assert rsub2.status_code == 200
        rapp = await client.post(f"/api/monthly-kpis/{sheet_id}/approve", headers=H(tok["manoj"]), json={"comment": "Approved"})
        assert rapp.status_code == 200 and rapp.json()["status"] == "APPROVED" and rapp.json()["locked"] is True

        rlock2 = await client.put("/api/monthly-kpis/actuals", headers=H(tok["kriti"]), json={
            "month": "2026-11", "entries": [{"kpi_code": "SP_NEW_LEADS", "actual": 1}],
        })
        assert rlock2.status_code == 400

        # 11. All 8 PRD KPI Reports + Excel/PDF exports
        for rep_id in (
            "kpi-monthly-scorecards", "kpi-dept-summary", "kpi-score-comparison",
            "kpi-achievement", "kpi-active-deactivated", "kpi-submission-status",
            "kpi-historical", "kpi-weekly-history",
        ):
            rr = await client.get(f"/api/reports/{rep_id}?start=2026-04-01&end=2026-11-30&month=2026-11", headers=H(tok["dj"]))
            assert rr.status_code == 200, (rep_id, rr.text)
            assert len(rr.json()["rows"]) >= 1, rep_id

        rx = await client.get("/api/reports/kpi-monthly-scorecards?start=2026-04-01&end=2026-11-30&format=xlsx", headers=H(tok["dj"]))
        assert rx.status_code == 200 and len(rx.content) > 100
        rp_pdf = await client.get("/api/reports/kpi-score-comparison?start=2026-04-01&end=2026-11-30&format=pdf", headers=H(tok["dj"]))
        assert rp_pdf.status_code == 200 and rp_pdf.content.startswith(b"%PDF")

        # 12. Audit logs & Notifications persisted
        audit_actions = {l["action"] for l in db.audit_logs.docs}
        for exp_act in (
            "PROJECT_CREATED", "PROJECT_STAGE_CHANGED", "WEEKLY_KPI_PROGRESS_LOGGED",
            "MONTHLY_KPI_ACTUAL_UPDATED", "KPI_ACTIVATED", "KPI_DEACTIVATED",
            "KPI_TOGGLE_REQUESTED", "MONTHLY_SCORECARD_SUBMITTED",
            "MONTHLY_SCORECARD_RETURNED", "MONTHLY_SCORECARD_APPROVED",
        ):
            assert exp_act in audit_actions, f"Missing audit action {exp_act}"

        notif_types = {n["type"] for n in db.notifications.docs}
        assert {"SCORECARD_SUBMITTED", "SCORECARD_CONFIRMED", "SCORECARD_RETURNED", "SCORECARD_APPROVED", "KPI_TOGGLE_REQUEST"} <= notif_types

    print("ALL_COMMAND_CENTER_AND_MONTHLY_KPI_TESTS_PASSED")


if __name__ == "__main__":
    asyncio.run(run_tests())
