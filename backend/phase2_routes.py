"""Phase 2: employee archive/delete, 7 core KPIs with 100% weight, monthly scorecard approval workflow."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, has_permission, require_permission
from core import audit, db, now_iso
from kpi_catalog import CORE_KPI_PROFILES
from metrics import fy_months
from seed import kpi_profiles

router = APIRouter(prefix="/api")
CORE_COUNT = 7
MONITOR = ("TARGETS_CONFIGURE", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW", "AUDIT_VIEW")


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3)


class CommentIn(BaseModel):
    comment: str = ""


# ─────────────── EMPLOYEE ARCHIVE / DELETE ───────────────
async def _target_user(uid: str, actor: dict) -> dict:
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("is_super_admin") or uid == actor["id"]:
        raise HTTPException(status_code=403, detail="This account cannot be archived or deleted")
    return u


async def history_counts(uid: str) -> dict:
    c = {
        "opportunities": await db.opportunities.count_documents({"$or": [{"primary_owner_id": uid}, {"contributor_ids": uid}]}),
        "leads": await db.leads.count_documents({"owner_id": uid}),
        "accounts": await db.accounts.count_documents({"owner_id": uid}),
        "campaigns": await db.campaigns.count_documents({"owner_id": uid}),
        "activities": await db.activities.count_documents({"assigned_to": uid}),
        "kpi_actuals": await db.kpi_actuals.count_documents({"user_id": uid}),
        "kpi_targets_set": await db.kpi_assignments.count_documents(
            {"user_id": uid, "$or": [{"actual_value": {"$ne": None}}, {"target_value": {"$ne": None}}, {"weightage": {"$ne": None}}]}),
        "sales_targets": await db.targets.count_documents({"user_id": uid}) + await db.target_revisions.count_documents({"user_id": uid}),
        "monthly_scorecards": await db.monthly_scorecards.count_documents({"user_id": uid}),
        "audit_actions": await db.audit_logs.count_documents({"user_id": uid}),
    }
    return {"counts": c, "has_history": any(c.values())}


async def _set_archive(uid: str, actor: dict, archived: bool, reason: str):
    u = await _target_user(uid, actor)
    if bool(u.get("is_archived")) == archived:
        raise HTTPException(status_code=400, detail="Employee is already " + ("archived" if archived else "active"))
    status = "Archived" if archived else "Active"
    hist = (u.get("status_history") or []) + [{"status": status, "employment_status": u.get("employment_status"),
                                                "reason": reason, "by": actor["id"], "at": now_iso()}]
    upd = {"is_archived": archived, "is_active": not archived, "status_history": hist, "updated_at": now_iso(),
           "archived_at": now_iso() if archived else None, "archived_by": actor["id"] if archived else None,
           "archive_reason": reason if archived else None}
    await db.users.update_one({"id": uid}, {"$set": upd})
    await audit(actor, "USER_ARCHIVED" if archived else "USER_RESTORED", "user", uid, details={"reason": reason, "user_id": uid},
                previous={"is_archived": bool(u.get("is_archived")), "is_active": u.get("is_active", True)},
                new={"is_archived": archived, "is_active": not archived})
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})


@router.post("/users/{uid}/archive")
async def archive_user(uid: str, payload: ReasonIn, actor: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    return await _set_archive(uid, actor, True, payload.reason)


@router.post("/users/{uid}/restore")
async def restore_user(uid: str, payload: ReasonIn, actor: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    return await _set_archive(uid, actor, False, payload.reason)


@router.get("/users/{uid}/delete-check")
async def delete_check(uid: str, actor: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    await _target_user(uid, actor)
    return await history_counts(uid)


class DeleteIn(BaseModel):
    confirm_email: str
    reason: str = Field(min_length=3)


@router.post("/users/{uid}/delete")
async def delete_user(uid: str, payload: DeleteIn, actor: dict = Depends(get_current_user)):
    if not actor.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only the Super Administrator can permanently delete an employee")
    u = await _target_user(uid, actor)
    if payload.confirm_email.strip().lower() != u["email"]:
        raise HTTPException(status_code=400, detail="Confirmation email does not match")
    h = await history_counts(uid)
    if h["has_history"]:
        raise HTTPException(status_code=400, detail="Employee has history; archive instead of deleting")
    blank = await db.kpi_assignments.delete_many({"user_id": uid})
    await db.invitations.delete_many({"user_id": uid})
    await db.users.delete_one({"id": uid})
    await audit(actor, "USER_DELETED", "user", uid, details={"reason": payload.reason, "blank_kpi_assignments_removed": blank.deleted_count},
                previous={k: u.get(k) for k in ("name", "email", "employee_id", "designation", "role_codes")})
    return {"ok": True}


# ─────────────── CORE KPIs (7 per employee) ───────────────
def core_codes_for(u: dict) -> list[str]:
    prof = kpi_profiles(u)
    for role, codes in CORE_KPI_PROFILES:
        if role in prof:
            return codes
    return CORE_KPI_PROFILES[-1][1]


async def apply_core_defaults(only_user_id: Optional[str] = None, fy_code: str = "FY2026-27") -> int:
    flt = {"is_test": {"$ne": True}, "is_duplicate": {"$ne": True}, "is_sales_contributor": True}
    if only_user_id:
        flt["id"] = only_user_id
    n = 0
    async for u in db.users.find(flt, {"_id": 0}):
        if await db.kpi_assignments.count_documents({"user_id": u["id"], "fy_code": fy_code, "is_core": True}):
            continue
        for code in core_codes_for(u):
            d = await db.kpi_definitions.find_one({"code": code}, {"_id": 0})
            if not d:
                continue
            res = await db.kpi_assignments.update_one({"user_id": u["id"], "kpi_code": code, "fy_code": fy_code},
                                                      {"$set": {"is_core": True, "is_active": True}})
            if not res.matched_count:
                await db.kpi_assignments.insert_one({
                    "id": str(uuid.uuid4()), "user_id": u["id"], "kpi_code": code, "fy_code": fy_code, "frequency": d["frequency"],
                    "target_value": None, "actual_value": None, "weightage": None, "start_date": "2026-04-01", "end_date": "2027-03-31",
                    "responsible_owner_id": u["id"], "is_active": True, "is_core": True, "approval_status": "DRAFT",
                    "actual_status": None, "created_at": now_iso(), "updated_at": now_iso(), "actual_updated_at": None})
        n += 1
    return n


async def core_weight_status(uid: str, fy_code: str) -> dict:
    core = [a async for a in db.kpi_assignments.find({"user_id": uid, "fy_code": fy_code, "is_core": True, "is_active": True}, {"_id": 0})]
    total = round(sum(float(a.get("weightage") or 0) for a in core), 2)
    missing = len([a for a in core if a.get("weightage") in (None, 0)])
    return {"core_count": len(core), "total_weightage": total, "missing_weights": missing,
            "valid": len(core) == CORE_COUNT and abs(total - 100) < 0.01 and missing == 0}


@router.get("/kpi/core-status/{uid}")
async def core_status(uid: str, fy_code: str = "FY2026-27", user: dict = Depends(get_current_user)):
    if uid != user["id"] and not any(has_permission(user, p) for p in MONITOR):
        raise HTTPException(status_code=403, detail="Not authorised")
    return await core_weight_status(uid, fy_code)


class CoreWeightsIn(BaseModel):
    fy_code: str = "FY2026-27"
    weights: dict[str, float]
    reason: str = Field(min_length=3)


@router.put("/kpi/core-weights/{uid}")
async def set_core_weights(uid: str, payload: CoreWeightsIn, user: dict = Depends(require_permission("TARGETS_CONFIGURE"))):
    if uid == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot set your own KPI weightage")
    core = {a["id"]: a async for a in db.kpi_assignments.find({"user_id": uid, "fy_code": payload.fy_code, "is_core": True, "is_active": True}, {"_id": 0})}
    if set(payload.weights) != set(core) or len(core) != CORE_COUNT:
        raise HTTPException(status_code=400, detail=f"Provide weightage for exactly the {CORE_COUNT} core KPIs of this employee")
    if any(w <= 0 for w in payload.weights.values()):
        raise HTTPException(status_code=400, detail="Each core KPI must have a weightage above 0")
    total = round(sum(payload.weights.values()), 2)
    if abs(total - 100) >= 0.01:
        raise HTTPException(status_code=400, detail=f"Core KPI weightage must total 100% (currently {total}%)")
    prev = {core[k]["kpi_code"]: core[k].get("weightage") for k in core}
    for aid, w in payload.weights.items():
        await db.kpi_assignments.update_one({"id": aid}, {"$set": {"weightage": w, "updated_at": now_iso()}})
        await db.kpi_assignment_history.insert_one({"id": str(uuid.uuid4()), "assignment_id": aid, "previous": {"weightage": core[aid].get("weightage")},
                                                    "new": {"weightage": w}, "reason": payload.reason, "by": user["id"], "at": now_iso()})
    await audit(user, "KPI_CORE_WEIGHTS_SET", "kpi_assignment", uid, details={"user_id": uid, "reason": payload.reason},
                previous=prev, new={core[k]["kpi_code"]: w for k, w in payload.weights.items()})
    return await core_weight_status(uid, payload.fy_code)


# ─────────────── MONTHLY SCORECARD WORKFLOW ───────────────
async def hod_user() -> Optional[dict]:
    return await db.users.find_one({"role_codes": "HEAD_OF_DEPARTMENT", "is_active": True, "is_test": {"$ne": True},
                                    "is_duplicate": {"$ne": True}}, {"_id": 0, "password_hash": 0})


async def approver_settings() -> dict:
    return await db.settings.find_one({"key": "scorecard_approvers"}, {"_id": 0}) or {}


async def resolve_approver(uid: str) -> Optional[dict]:
    hod = await hod_user()
    if hod and hod["id"] != uid:
        return hod
    aid = (await approver_settings()).get("hod_approver_id")
    return await db.users.find_one({"id": aid, "is_active": True}, {"_id": 0, "password_hash": 0}) if aid else None


async def init_approver_settings() -> None:
    if (await approver_settings()).get("hod_approver_id"):
        return
    ops = await db.users.find_one({"functional_responsibility": {"$regex": "Operation", "$options": "i"}, "is_active": True,
                                   "is_test": {"$ne": True}, "is_duplicate": {"$ne": True}}, {"_id": 0})
    if ops:
        await db.settings.update_one({"key": "scorecard_approvers"}, {"$set": {"key": "scorecard_approvers", "hod_approver_id": ops["id"],
                                                                               "updated_at": now_iso()}}, upsert=True)


@router.get("/settings/scorecard-approvers")
async def get_approvers(user: dict = Depends(get_current_user)):
    s = await approver_settings()
    hod = await hod_user()
    ha = await db.users.find_one({"id": s.get("hod_approver_id")}, {"_id": 0, "name": 1, "id": 1}) if s.get("hod_approver_id") else None
    return {"hod": {"id": hod["id"], "name": hod["name"]} if hod else None, "hod_approver": ha}


def _fy_of(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    start = y if m >= 4 else y - 1
    return f"FY{start}-{str(start + 1)[2:]}"


async def scorecard_locked(uid: str, month: str) -> bool:
    return bool(await db.monthly_scorecards.find_one({"user_id": uid, "month": month, "status": {"$in": ["SUBMITTED", "APPROVED"]}}))


def _can_read(user: dict, sc: dict) -> bool:
    return sc["user_id"] == user["id"] or sc.get("approver_id") == user["id"] or user.get("is_super_admin") \
        or any(has_permission(user, p) for p in MONITOR)


@router.get("/scorecards/monthly")
async def list_monthly(user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    uid = user_id or user["id"]
    rows = [s async for s in db.monthly_scorecards.find({"user_id": uid}, {"_id": 0}).sort("month", -1)]
    if uid != user["id"] and not (user.get("is_super_admin") or any(has_permission(user, p) for p in MONITOR)):
        rows = [r for r in rows if r.get("approver_id") == user["id"]]
        if not rows:
            raise HTTPException(status_code=403, detail="Not authorised")
    ap = await resolve_approver(uid)
    return {"approver": {"id": ap["id"], "name": ap["name"]} if ap else None, "items": rows}


@router.get("/scorecards/monthly/queue")
async def approval_queue(user: dict = Depends(get_current_user)):
    return [s async for s in db.monthly_scorecards.find({"approver_id": user["id"], "status": "SUBMITTED"}, {"_id": 0}).sort("submitted_at", 1)]


class SubmitIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    comment: str = ""


@router.post("/scorecards/monthly/submit")
async def submit_monthly(payload: SubmitIn, user: dict = Depends(get_current_user)):
    from kpi_routes import build_scorecard
    if payload.month > datetime.now(timezone.utc).strftime("%Y-%m"):
        raise HTTPException(status_code=400, detail="You cannot submit a scorecard for a future month")
    fy = _fy_of(payload.month)
    if payload.month not in fy_months(fy):
        raise HTTPException(status_code=400, detail="Invalid month")
    cw = await core_weight_status(user["id"], fy)
    if not cw["valid"]:
        raise HTTPException(status_code=400, detail=f"Your {CORE_COUNT} core KPIs must have weightage totalling 100% before submission "
                                                    f"(found {cw['core_count']} core KPIs, {cw['total_weightage']}%). Ask your HOD to set them.")
    ap = await resolve_approver(user["id"])
    if not ap:
        raise HTTPException(status_code=400, detail="No approver is configured for your scorecard")
    existing = await db.monthly_scorecards.find_one({"user_id": user["id"], "month": payload.month}, {"_id": 0})
    if existing and existing["status"] in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is already {existing['status'].lower()}")
    sc = await build_scorecard(user["id"], fy)
    core = [i for i in sc["items"] if i.get("is_core")]
    entry = {"action": "SUBMITTED", "by": user["id"], "by_name": user["name"], "comment": payload.comment, "at": now_iso()}
    data = {"fy_code": fy, "status": "SUBMITTED", "approver_id": ap["id"], "approver_name": ap["name"], "items": core,
            "overall_score": sc["overall_score"], "total_weightage": sc["total_weightage"], "submitted_at": now_iso(),
            "decided_at": None, "decided_by": None, "decision_comment": None, "updated_at": now_iso()}
    if existing:
        await db.monthly_scorecards.update_one({"id": existing["id"]}, {"$set": data, "$push": {"history": entry}})
        sid = existing["id"]
    else:
        sid = str(uuid.uuid4())
        await db.monthly_scorecards.insert_one({"id": sid, "user_id": user["id"], "user_name": user["name"], "month": payload.month,
                                                **data, "history": [entry], "created_at": now_iso()})
    await audit(user, "SCORECARD_SUBMITTED", "monthly_scorecard", sid, details={"month": payload.month, "approver_id": ap["id"],
                                                                                 "approver_name": ap["name"]},
                previous={"status": existing["status"]} if existing else None, new={"status": "SUBMITTED", "overall_score": sc["overall_score"]})
    return await db.monthly_scorecards.find_one({"id": sid}, {"_id": 0})


async def _decide(sid: str, user: dict, action: str, comment: str):
    sc = await db.monthly_scorecards.find_one({"id": sid}, {"_id": 0})
    if not sc:
        raise HTTPException(status_code=404, detail="Scorecard not found")
    if sc["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot decide on your own scorecard")
    if sc.get("approver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the designated approver can act on this scorecard")
    need = {"APPROVED": "SUBMITTED", "REJECTED": "SUBMITTED", "REOPENED": "APPROVED"}[action]
    if sc["status"] != need:
        raise HTTPException(status_code=400, detail=f"Scorecard must be {need.lower()} to be {action.lower()}")
    if action in ("REJECTED", "REOPENED") and len(comment.strip()) < 3:
        raise HTTPException(status_code=400, detail="A reason is required")
    entry = {"action": action, "by": user["id"], "by_name": user["name"], "comment": comment, "at": now_iso()}
    await db.monthly_scorecards.update_one({"id": sid}, {"$set": {"status": action, "decided_at": now_iso(), "decided_by": user["id"],
                                                                  "decided_by_name": user["name"], "decision_comment": comment,
                                                                  "locked": action == "APPROVED", "updated_at": now_iso()},
                                                         "$push": {"history": entry}})
    await audit(user, f"SCORECARD_{action}", "monthly_scorecard", sid, details={"user_id": sc["user_id"], "month": sc["month"], "comment": comment},
                previous={"status": sc["status"]}, new={"status": action})
    return await db.monthly_scorecards.find_one({"id": sid}, {"_id": 0})


@router.get("/scorecards/monthly/{sid}")
async def get_monthly(sid: str, user: dict = Depends(get_current_user)):
    sc = await db.monthly_scorecards.find_one({"id": sid}, {"_id": 0})
    if not sc or not _can_read(user, sc):
        raise HTTPException(status_code=404, detail="Scorecard not found")
    return sc


@router.post("/scorecards/monthly/{sid}/approve")
async def approve_monthly(sid: str, payload: CommentIn, user: dict = Depends(get_current_user)):
    return await _decide(sid, user, "APPROVED", payload.comment)


@router.post("/scorecards/monthly/{sid}/reject")
async def reject_monthly(sid: str, payload: CommentIn, user: dict = Depends(get_current_user)):
    return await _decide(sid, user, "REJECTED", payload.comment)


@router.post("/scorecards/monthly/{sid}/reopen")
async def reopen_monthly(sid: str, payload: CommentIn, user: dict = Depends(get_current_user)):
    return await _decide(sid, user, "REOPENED", payload.comment)
