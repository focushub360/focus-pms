"""KPI Library, KPI assignments/actuals, scorecards, targets with revision + approval workflow."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, has_permission, require_permission
from core import audit, db, now_iso
from kpi_catalog import FREQUENCIES, SYSTEM_KPI_MAP
from metrics import DEPT_TARGET_KEY, excluded_user_ids, fy_months, period_range, pct, user_metrics

router = APIRouter(prefix="/api")

VIEW_OTHERS = ("TARGETS_CONFIGURE", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW")


def can_view_user(user: dict, uid: str) -> bool:
    return uid == user["id"] or any(has_permission(user, p) for p in VIEW_OTHERS)


def ensure_view(user: dict, uid: str) -> None:
    if not can_view_user(user, uid):
        raise HTTPException(status_code=403, detail="Not authorised to view this employee's performance")


# ─────────────── KPI LIBRARY ───────────────
class KpiDefIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2)
    category: str
    description: str = ""
    unit: str = "count"
    formula: str = ""
    frequency: str = "MONTHLY"
    applicable_roles: list[str] = Field(default_factory=list)
    applies_to_all_sales: bool = False
    direction: str = "higher"
    data_source: str = "MANUAL"
    is_active: bool = True


@router.get("/kpi/categories")
async def kpi_categories(user: dict = Depends(get_current_user)):
    return [c async for c in db.kpi_categories.find({}, {"_id": 0})]


@router.get("/kpi/definitions")
async def kpi_definitions(user: dict = Depends(get_current_user)):
    return [d async for d in db.kpi_definitions.find({}, {"_id": 0}).sort([("category", 1), ("name", 1)])]


@router.post("/kpi/definitions")
async def create_kpi(payload: KpiDefIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    code = payload.code.upper().strip()
    if await db.kpi_definitions.find_one({"$or": [{"code": code}, {"name": payload.name.strip()}]}):
        raise HTTPException(status_code=400, detail="A KPI with this code or name already exists")
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid frequency")
    doc = {"id": str(uuid.uuid4()), **payload.model_dump(), "code": code, "is_custom": True,
           "approval_status": "APPROVED", "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.kpi_definitions.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "KPI_CREATED", "kpi_definition", doc["id"], new={"code": code, "name": payload.name})
    return doc


@router.patch("/kpi/definitions/{kpi_id}")
async def update_kpi(kpi_id: str, payload: KpiDefIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    old = await db.kpi_definitions.find_one({"id": kpi_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="KPI not found")
    data = payload.model_dump(exclude={"code"})
    if old.get("data_source") == "SYSTEM":
        data["data_source"] = "SYSTEM"
    await db.kpi_definitions.update_one({"id": kpi_id}, {"$set": {**data, "updated_at": now_iso()}})
    changed = {k: old.get(k) for k in data if old.get(k) != data[k]}
    await audit(user, "KPI_REVISED", "kpi_definition", kpi_id, previous=changed, new={k: data[k] for k in changed})
    return await db.kpi_definitions.find_one({"id": kpi_id}, {"_id": 0})


# ─────────────── THRESHOLDS ───────────────
class ThresholdIn(BaseModel):
    achieved: float = Field(gt=0)
    on_track: float = Field(gt=0)
    at_risk: float = Field(ge=0)


async def get_thresholds() -> dict:
    t = await db.settings.find_one({"key": "kpi_thresholds"}, {"_id": 0}) or {}
    return {"achieved": t.get("achieved", 100), "on_track": t.get("on_track", 80), "at_risk": t.get("at_risk", 60)}


@router.get("/settings/kpi-thresholds")
async def read_thresholds(user: dict = Depends(get_current_user)):
    return await get_thresholds()


@router.put("/settings/kpi-thresholds")
async def write_thresholds(payload: ThresholdIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    if not (payload.achieved >= payload.on_track >= payload.at_risk):
        raise HTTPException(status_code=400, detail="Thresholds must satisfy achieved ≥ on track ≥ at risk")
    old = await get_thresholds()
    await db.settings.update_one({"key": "kpi_thresholds"}, {"$set": payload.model_dump()}, upsert=True)
    await audit(user, "KPI_THRESHOLDS_CHANGED", "settings", "kpi_thresholds", previous=old, new=payload.model_dump())
    return payload.model_dump()


def kpi_status(p: Optional[float], actual, target, th: dict) -> str:
    if actual is None:
        return "NOT_UPDATED"
    if target in (None, 0) or p is None:
        return "TARGET_PENDING"
    if p >= th["achieved"]:
        return "ACHIEVED"
    if p >= th["on_track"]:
        return "ON_TRACK"
    if p >= th["at_risk"]:
        return "AT_RISK"
    return "BELOW_TARGET"


# ─────────────── ASSIGNMENTS + ACTUALS ───────────────
class AssignmentIn(BaseModel):
    user_id: str
    kpi_code: str
    fy_code: str = "FY2026-27"
    frequency: Optional[str] = None
    target_value: Optional[float] = Field(default=None, ge=0)
    weightage: Optional[float] = Field(default=None, ge=0, le=100)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    responsible_owner_id: Optional[str] = None
    is_active: bool = True


class AssignmentPatch(BaseModel):
    target_value: Optional[float] = Field(default=None, ge=0)
    weightage: Optional[float] = Field(default=None, ge=0, le=100)
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None
    is_core: Optional[bool] = None
    reason: str = ""


class ActualIn(BaseModel):
    actual_value: float = Field(ge=0)
    period: Optional[str] = None
    note: str = ""


@router.get("/kpi/assignments")
async def list_assignments(user_id: str, fy_code: str = "FY2026-27", user: dict = Depends(get_current_user)):
    ensure_view(user, user_id)
    defs = {d["code"]: d async for d in db.kpi_definitions.find({}, {"_id": 0})}
    out = []
    async for a in db.kpi_assignments.find({"user_id": user_id, "fy_code": fy_code}, {"_id": 0}):
        d = defs.get(a["kpi_code"], {})
        out.append({**a, "kpi_name": d.get("name"), "category": d.get("category"), "unit": d.get("unit"), "data_source": d.get("data_source")})
    return sorted(out, key=lambda x: (x["category"] or "", x["kpi_name"] or ""))


@router.post("/kpi/assignments")
async def create_assignment(payload: AssignmentIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    d = await db.kpi_definitions.find_one({"code": payload.kpi_code})
    if not d or not await db.users.find_one({"id": payload.user_id}):
        raise HTTPException(status_code=404, detail="KPI or employee not found")
    if await db.kpi_assignments.find_one({"user_id": payload.user_id, "kpi_code": payload.kpi_code, "fy_code": payload.fy_code}):
        raise HTTPException(status_code=400, detail="This KPI is already assigned to the employee for this FY")
    s, e = period_range(payload.fy_code)
    doc = {"id": str(uuid.uuid4()), **payload.model_dump(), "frequency": payload.frequency or d["frequency"],
           "start_date": payload.start_date or s, "end_date": payload.end_date or e,
           "responsible_owner_id": payload.responsible_owner_id or payload.user_id,
           "actual_value": None, "actual_status": None, "approval_status": "APPROVED" if payload.target_value is not None else "DRAFT",
           "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(), "actual_updated_at": None}
    await db.kpi_assignments.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "KPI_ASSIGNED", "kpi_assignment", doc["id"], new={"user_id": payload.user_id, "kpi": payload.kpi_code, "target": payload.target_value})
    return doc


@router.patch("/kpi/assignments/{aid}")
async def patch_assignment(aid: str, payload: AssignmentPatch, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    old = await db.kpi_assignments.find_one({"id": aid}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if old["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot revise your own KPI targets; another authorised manager must do it")
    data = payload.model_dump(exclude_unset=True, exclude={"reason"})
    if data.get("is_core") and not old.get("is_core") and await db.kpi_assignments.count_documents(
            {"user_id": old["user_id"], "fy_code": old["fy_code"], "is_core": True, "is_active": True}) >= 7:
        raise HTTPException(status_code=400, detail="This employee already has 7 core KPIs; remove one from core first")
    if "target_value" in data or "weightage" in data:
        data["approval_status"] = "APPROVED"
    data["updated_at"] = now_iso()
    await db.kpi_assignments.update_one({"id": aid}, {"$set": data})
    await db.kpi_assignment_history.insert_one({"id": str(uuid.uuid4()), "assignment_id": aid, "previous": {k: old.get(k) for k in data},
                                                "new": data, "reason": payload.reason, "by": user["id"], "at": now_iso()})
    await audit(user, "KPI_TARGET_REVISED", "kpi_assignment", aid, details={"reason": payload.reason, "user_id": old["user_id"]},
                previous={k: old.get(k) for k in data if k != "updated_at"}, new={k: v for k, v in data.items() if k != "updated_at"})
    return await db.kpi_assignments.find_one({"id": aid}, {"_id": 0})


@router.post("/kpi/assignments/{aid}/actual")
async def submit_actual(aid: str, payload: ActualIn, user: dict = Depends(get_current_user)):
    a = await db.kpi_assignments.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    d = await db.kpi_definitions.find_one({"code": a["kpi_code"]}, {"_id": 0})
    own = a["user_id"] == user["id"] and has_permission(user, "KPI_ACTUAL_SELF_UPDATE")
    if not own:
        raise HTTPException(status_code=403, detail="Only the employee can enter their own KPI actuals; managers must request a correction")
    if d and d.get("data_source") == "SYSTEM":
        raise HTTPException(status_code=400, detail="This KPI is calculated automatically from system records")
    from phase2_routes import scorecard_locked
    for month in {now_iso()[:7], (payload.period or now_iso())[:7]}:
        if await scorecard_locked(a["user_id"], month):
            raise HTTPException(status_code=400, detail=f"Your {month} scorecard is submitted/approved and locked; ask your approver to reopen it")
    status = "SUBMITTED"
    await db.kpi_actuals.insert_one({"id": str(uuid.uuid4()), "assignment_id": aid, "user_id": a["user_id"], "kpi_code": a["kpi_code"],
                                     "value": payload.actual_value, "period": payload.period, "note": payload.note,
                                     "entered_by": user["id"], "status": status, "at": now_iso()})
    await db.kpi_assignments.update_one({"id": aid}, {"$set": {"actual_value": payload.actual_value, "actual_status": status,
                                                                "actual_updated_at": now_iso(), "actual_note": payload.note}})
    await audit(user, "KPI_ACTUAL_UPDATED", "kpi_assignment", aid, details={"kpi": a["kpi_code"], "user_id": a["user_id"]},
                previous={"actual_value": a.get("actual_value")}, new={"actual_value": payload.actual_value, "status": status})
    return await db.kpi_assignments.find_one({"id": aid}, {"_id": 0})


@router.post("/kpi/assignments/{aid}/validate")
async def validate_actual(aid: str, user: dict = Depends(require_permission("KPI_ACTUAL_VALIDATE"))):
    a = await db.kpi_assignments.find_one({"id": aid})
    if not a or a.get("actual_value") is None:
        raise HTTPException(status_code=404, detail="No actual to validate")
    if a["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot validate your own KPI actual")
    await db.kpi_assignments.update_one({"id": aid}, {"$set": {"actual_status": "VALIDATED", "validated_by": user["id"], "validated_at": now_iso()}})
    await audit(user, "KPI_ACTUAL_VALIDATED", "kpi_assignment", aid, previous={"actual_status": a.get("actual_status")}, new={"actual_status": "VALIDATED"})
    return {"ok": True}


@router.get("/kpi/assignments/{aid}/history")
async def assignment_history(aid: str, user: dict = Depends(get_current_user)):
    a = await db.kpi_assignments.find_one({"id": aid})
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    ensure_view(user, a["user_id"])
    actuals = [x async for x in db.kpi_actuals.find({"assignment_id": aid}, {"_id": 0}).sort("at", -1)]
    revisions = [x async for x in db.kpi_assignment_history.find({"assignment_id": aid}, {"_id": 0}).sort("at", -1)]
    return {"actuals": actuals, "revisions": revisions}


# ─────────────── SCORECARD ───────────────
async def department_metrics(fy_code: str, start: str, end: str, user_filter: Optional[str] = None,
                             stage: Optional[str] = None, category: Optional[str] = None) -> dict:
    excl = await excluded_user_ids(db)
    users = [u async for u in db.users.find({"is_sales_contributor": True}, {"_id": 0, "password_hash": 0})
             if u["id"] not in excl]
    if user_filter:
        users = [u for u in users if u["id"] == user_filter]
    opps = [o async for o in db.opportunities.find({}, {"_id": 0})]
    rows = []
    for u in users:
        m = await user_metrics(db, u["id"], fy_code, start, end, opps, stage, category)
        m.update({"name": u["name"], "designation": u.get("designation"), "functional_responsibility": u.get("functional_responsibility"),
                  "is_active": u.get("is_active", True)})
        rows.append(m)
    dept_t = await db.targets.find_one({"user_id": DEPT_TARGET_KEY, "fy_code": fy_code}, {"_id": 0}) or {}
    indiv_sum = sum(r["target_inr"] or 0 for r in rows)
    dept_target = float(dept_t.get("sales_target_inr") or 0) or (indiv_sum or None)
    won = sum(r["confirmed_won_inr"] for r in rows)
    achs = [r["achievement_pct"] for r in rows if r["achievement_pct"] is not None]
    # Department totals on opportunity basis (no double counting across contributors)
    dept_opps = [o for o in opps if o.get("primary_owner_id") not in excl
                 and (not stage or o.get("stage") == stage) and (not category or o.get("service_category") == category)
                 and (not user_filter or o.get("primary_owner_id") == user_filter or user_filter in (o.get("contributor_ids") or []))]
    won_c = len([o for o in dept_opps if o.get("stage") == "Won" and start <= ((o.get("confirmed_order_date") or o.get("updated_at") or "")[:10]) <= end])
    lost_c = len([o for o in dept_opps if o.get("stage") == "Lost" and start <= (o.get("updated_at") or "")[:10] <= end])
    return {
        "rows": rows,
        "department_target_inr": dept_target,
        "department_target_source": "DEPARTMENT" if dept_t else ("SUM_OF_INDIVIDUAL" if indiv_sum else None),
        "individual_target_sum_inr": indiv_sum or None,
        "confirmed_won_inr": round(won, 2),
        "achievement_pct": pct(won, dept_target or 0),
        "pipeline_inr": round(sum(r["pipeline_inr"] for r in rows), 2),
        "weighted_pipeline_inr": round(sum(r["weighted_pipeline_inr"] for r in rows), 2),
        "leads_qualified": sum(r["leads_qualified"] for r in rows),
        "leads_total": sum(r["leads_total"] for r in rows),
        "proposals_submitted": len([o for o in dept_opps if start <= (o.get("proposal_submitted_at") or "")[:10] <= end]),
        "won_count": won_c,
        "lost_count": lost_c,
        "win_rate_pct": pct(won_c, won_c + lost_c),
        "team_avg_achievement_pct": round(sum(achs) / len(achs), 2) if achs else None,
        "overdue_activities": sum(r["overdue_activities"] for r in rows),
        "meetings_completed": sum(r["meetings_completed"] for r in rows),
        "calls_completed": sum(r["calls_completed"] for r in rows),
    }


async def build_scorecard(uid: str, fy_code: str, metrics: Optional[dict] = None, dept: Optional[dict] = None) -> dict:
    s, e = period_range(fy_code)
    m = metrics or await user_metrics(db, uid, fy_code, s, e)
    th = await get_thresholds()
    defs = {d["code"]: d async for d in db.kpi_definitions.find({}, {"_id": 0})}
    items, w_sum, w_score = [], 0.0, 0.0
    has_core = bool(await db.kpi_assignments.count_documents({"user_id": uid, "fy_code": fy_code, "is_active": True, "is_core": True}))
    m = {**m, "lost_doc_pct": pct(m["lost_with_reason"], m["lost_count"]), "l2o_pct": pct(m["opp_created"], m["leads_total"])}
    src = {x["source"]: x["count"] for x in m["leads_by_source"]}
    async for a in db.kpi_assignments.find({"user_id": uid, "fy_code": fy_code, "is_active": True}, {"_id": 0}):
        d = defs.get(a["kpi_code"])
        if not d or not d.get("is_active", True):
            continue
        target = a.get("target_value")
        if a["kpi_code"] == "SP_INDIV_TARGET" and target is None:
            target = m["target_inr"]
        actual, last = a.get("actual_value"), a.get("actual_updated_at")
        key = SYSTEM_KPI_MAP.get(a["kpi_code"]) if d.get("data_source") == "SYSTEM" else None
        if key:
            if key.startswith("src:"):
                actual = src.get(key[4:], 0)
            elif key.startswith("dept:"):
                if dept is None:
                    ds, de = period_range(fy_code)
                    dept = await department_metrics(fy_code, ds, de)
                actual = dept.get(key[5:])
            else:
                actual = m.get(key)
            last = now_iso()
        if d.get("direction") == "lower":
            p = round(target / actual * 100, 2) if (actual and target is not None) else (100.0 if actual == 0 and target is not None else None)
        else:
            p = pct(actual or 0, target or 0) if actual is not None else None
        w = a.get("weightage")
        core = bool(a.get("is_core"))
        ws = round(p * w / 100, 2) if (p is not None and w and (core or not has_core)) else None
        if ws is not None:
            w_sum += w
            w_score += ws
        items.append({
            "assignment_id": a["id"], "kpi_code": a["kpi_code"], "kpi_name": d["name"], "category": d["category"],
            "unit": d["unit"], "formula": d.get("formula"), "frequency": a.get("frequency"), "data_source": d.get("data_source"),
            "direction": d.get("direction"), "target": target, "actual": actual, "achievement_pct": p, "weightage": w,
            "weighted_score": ws, "status": kpi_status(p, actual, target, th), "actual_status": a.get("actual_status"),
            "approval_status": a.get("approval_status"), "last_updated": last, "is_core": core,
        })
    items.sort(key=lambda i: not i["is_core"])
    return {"user_id": uid, "fy_code": fy_code, "thresholds": th, "items": items,
            "total_weightage": w_sum or None, "overall_score": round(w_score / w_sum * 100, 2) if w_sum else None}


@router.get("/kpi/scorecard/{uid}")
async def scorecard(uid: str, fy_code: str = "FY2026-27", user: dict = Depends(get_current_user)):
    ensure_view(user, uid)
    return await build_scorecard(uid, fy_code)


# ─────────────── TARGETS + REVISIONS ───────────────
class TargetRevisionIn(BaseModel):
    user_id: str  # employee id or "DEPARTMENT"
    fy_code: str = "FY2026-27"
    sales_target_inr: float = Field(ge=0)
    monthly_targets: dict[str, float] = Field(default_factory=dict)
    activity_targets: dict[str, float] = Field(default_factory=dict)
    campaign_targets: dict[str, float] = Field(default_factory=dict)
    effective_date: Optional[str] = None
    reason: str = Field(min_length=3)


class DecisionIn(BaseModel):
    comment: str = ""


@router.get("/targets")
async def list_targets(fy_code: str = "FY2026-27", user: dict = Depends(get_current_user)):
    flt: dict = {"fy_code": fy_code}
    if not any(has_permission(user, p) for p in VIEW_OTHERS):
        flt["user_id"] = {"$in": [user["id"], DEPT_TARGET_KEY]}
    return [t async for t in db.targets.find(flt, {"_id": 0})]


@router.post("/targets/revisions")
async def submit_target_revision(payload: TargetRevisionIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    if payload.user_id != DEPT_TARGET_KEY and not await db.users.find_one({"id": payload.user_id}):
        raise HTTPException(status_code=404, detail="Employee not found")
    months = set(fy_months(payload.fy_code))
    bad = [k for k in payload.monthly_targets if k not in months]
    if bad:
        raise HTTPException(status_code=400, detail=f"Months outside {payload.fy_code}: {', '.join(bad)}")
    msum = sum(payload.monthly_targets.values())
    if payload.monthly_targets and abs(msum - payload.sales_target_inr) > 1:
        raise HTTPException(status_code=400, detail=f"Monthly targets total ₹{msum:,.0f} must equal the annual target ₹{payload.sales_target_inr:,.0f}")
    if await db.target_revisions.find_one({"user_id": payload.user_id, "fy_code": payload.fy_code, "status": "PENDING"}):
        raise HTTPException(status_code=400, detail="A revision is already pending approval for this target")
    current = await db.targets.find_one({"user_id": payload.user_id, "fy_code": payload.fy_code}, {"_id": 0}) or {}
    rev = {"id": str(uuid.uuid4()), **payload.model_dump(), "status": "PENDING",
           "previous": {k: current.get(k) for k in ("sales_target_inr", "monthly_targets", "activity_targets", "campaign_targets", "effective_date")},
           "submitted_by": user["id"], "submitted_by_name": user["name"], "submitted_at": now_iso()}
    await db.target_revisions.insert_one(rev)
    rev.pop("_id", None)
    await audit(user, "TARGET_REVISION_SUBMITTED", "target", rev["id"], details={"user_id": payload.user_id, "reason": payload.reason},
                previous=rev["previous"], new={"sales_target_inr": payload.sales_target_inr})
    return rev


@router.get("/targets/revisions")
async def list_revisions(fy_code: str = "FY2026-27", status: Optional[str] = None, user_id: Optional[str] = None,
                         user: dict = Depends(get_current_user)):
    flt: dict = {"fy_code": fy_code}
    if status:
        flt["status"] = status
    if user_id:
        ensure_view(user, user_id) if user_id != DEPT_TARGET_KEY else None
        flt["user_id"] = user_id
    elif not any(has_permission(user, p) for p in VIEW_OTHERS + ("TARGETS_APPROVE",)):
        flt["user_id"] = user["id"]
    return [r async for r in db.target_revisions.find(flt, {"_id": 0}).sort("submitted_at", -1)]


async def _decide(rev_id: str, user: dict, approve: bool, comment: str):
    rev = await db.target_revisions.find_one({"id": rev_id}, {"_id": 0})
    if not rev or rev["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Revision not pending")
    if rev["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot approve or reject your own target")
    status = "APPROVED" if approve else "REJECTED"
    await db.target_revisions.update_one({"id": rev_id}, {"$set": {"status": status, "decided_by": user["id"], "decided_by_name": user["name"],
                                                                   "decided_at": now_iso(), "decision_comment": comment}})
    if approve:
        data = {k: rev[k] for k in ("sales_target_inr", "monthly_targets", "activity_targets", "campaign_targets", "effective_date")}
        existing = await db.targets.find_one({"user_id": rev["user_id"], "fy_code": rev["fy_code"]})
        if existing:
            await db.targets.update_one({"id": existing["id"]}, {"$set": {**data, "approved_revision_id": rev_id, "updated_at": now_iso()}})
        else:
            await db.targets.insert_one({"id": str(uuid.uuid4()), "user_id": rev["user_id"], "fy_code": rev["fy_code"], **data,
                                         "approved_revision_id": rev_id, "created_at": now_iso(), "updated_at": now_iso()})
    await audit(user, f"TARGET_REVISION_{status}", "target", rev_id, details={"user_id": rev["user_id"], "comment": comment},
                previous=rev["previous"], new={"sales_target_inr": rev["sales_target_inr"]} if approve else None)
    return await db.target_revisions.find_one({"id": rev_id}, {"_id": 0})


@router.post("/targets/revisions/{rev_id}/approve")
async def approve_revision(rev_id: str, payload: DecisionIn, user: dict = Depends(require_permission("TARGETS_APPROVE"))):
    return await _decide(rev_id, user, True, payload.comment)


@router.post("/targets/revisions/{rev_id}/reject")
async def reject_revision(rev_id: str, payload: DecisionIn, user: dict = Depends(require_permission("TARGETS_APPROVE"))):
    return await _decide(rev_id, user, False, payload.comment)
