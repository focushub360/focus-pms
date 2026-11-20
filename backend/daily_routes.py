"""Daily Activity: mandatory daily employee reports with midnight IST lock, HOD review and correction workflow."""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from activity_routes import IST, ist_dt, is_working_day
from auth import get_current_user
from core import audit, db, now_iso
from phase2_routes import hod_user
from storage import APP_NAME, get_object, put_object

router = APIRouter(prefix="/api")
CORRECTION_HOURS = 24
MAX_FILE = 10 * 1024 * 1024
ALLOWED_EXT = {"pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"}
MANUAL_COUNTS = ["site_visits", "emails_sent", "other_activities"]


def today_ist() -> date:
    return datetime.now(IST).date()


def _parse(d: str) -> date:
    try:
        return date.fromisoformat(d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")


async def reviewer_for(uid: str) -> Optional[dict]:
    hod = await hod_user()
    return hod if hod and hod["id"] != uid else None


def is_reviewer(user: dict, hod: Optional[dict], owner_id: str) -> bool:
    return bool(hod) and hod["id"] == user["id"] and owner_id != user["id"]


async def can_read(user: dict, owner_id: str) -> bool:
    if owner_id == user["id"] or user.get("is_super_admin"):
        return True
    return is_reviewer(user, await hod_user(), owner_id)


def editable(r: Optional[dict], d: date) -> tuple[bool, str]:
    if d > today_ist():
        return False, "Future dates cannot be reported"
    if r and r.get("status") == "APPROVED":
        return False, "Approved by HOD. Request a correction to change it."
    window = (r or {}).get("correction_unlocked_until")
    if window and window > now_iso():
        return True, f"Correction window open until {window}"
    if d < today_ist():
        return False, "Locked at midnight (Asia/Kolkata). Request a correction from your HOD."
    return True, "Editable until 11:59:59 PM IST today"


async def system_counts(uid: str, d: date) -> dict:
    s, e = ist_dt(d, 0, 0), ist_dt(d + timedelta(days=1), 0, 0)
    rng = {"$gte": s, "$lt": e}
    acts = [a async for a in db.activities.find({"assigned_to": uid, "status": "Completed", "start_at": rng}, {"_id": 0})]
    by = lambda t: sum(1 for a in acts if a.get("activity_type") == t)  # noqa: E731
    return {
        "sales_calls": by("Sales Call"), "customer_meetings": by("Customer Meeting"), "follow_ups": by("Follow-up"),
        "tasks_completed": by("Task"),
        "leads_created": await db.leads.count_documents({"owner_id": uid, "created_at": rng}),
        "opportunities_created": await db.opportunities.count_documents({"primary_owner_id": uid, "created_at": rng}),
        "proposals_submitted": await db.opportunities.count_documents(
            {"$or": [{"primary_owner_id": uid}, {"contributor_ids": uid}], "proposal_submitted_at": rng}),
    }


async def calendar_prefill(uid: str, d: date) -> list[dict]:
    s, e = ist_dt(d, 0, 0), ist_dt(d + timedelta(days=1), 0, 0)
    out = []
    async for a in db.activities.find({"assigned_to": uid, "status": "Completed", "start_at": {"$gte": s, "$lt": e}}, {"_id": 0}).sort("start_at", 1):
        link = ("opportunity", a["opportunity_id"]) if a.get("opportunity_id") else ("account", a["account_id"]) if a.get("account_id") \
            else ("lead", a["lead_id"]) if a.get("lead_id") else (None, None)
        out.append({"id": str(uuid.uuid4()), "description": a["title"], "category": a["activity_type"], "link_type": link[0],
                    "link_id": link[1], "outcome": a.get("outcome") or a.get("notes") or "", "activity_id": a["id"]})
    return out


def _public(r: dict) -> dict:
    return {**r, "attachments": [{k: v for k, v in x.items() if k != "storage_path"} for x in r.get("attachments") or [] if not x.get("is_deleted")]}


async def _report_view(uid: str, d: date, user: dict) -> dict:
    r = await db.daily_reports.find_one({"user_id": uid, "date": d.isoformat()}, {"_id": 0})
    owner = await db.users.find_one({"id": uid}, {"_id": 0, "name": 1, "employee_id": 1, "department": 1, "designation": 1})
    ok, why = editable(r, d)
    rev = await reviewer_for(uid)
    base = r or {"id": None, "user_id": uid, "date": d.isoformat(), "status": "MISSING" if d < today_ist() else "NOT_STARTED", "entries": await calendar_prefill(uid, d) if uid == user["id"] else [],
                 "pending": [], "support_required": "", "next_day_plan": "", "manual_counts": {k: 0 for k in MANUAL_COUNTS}, "attachments": []}
    counts = base.get("system_counts") if base.get("status") in ("SUBMITTED", "APPROVED") and not ok else await system_counts(uid, d)
    return {**_public(base), "employee": owner, "working_day": is_working_day(d), "editable": ok and uid == user["id"], "lock_reason": why,
            "system_counts": counts, "reviewer": {"id": rev["id"], "name": rev["name"]} if rev else None,
            "can_review": is_reviewer(user, rev, uid)}


@router.get("/daily-reports/day")
async def get_day(date_: Optional[str] = Query(None, alias="date"), user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    uid = user_id or user["id"]
    if not await can_read(user, uid):
        raise HTTPException(status_code=403, detail="Not authorised to view this employee's daily report")
    return await _report_view(uid, _parse(date_) if date_ else today_ist(), user)


class Entry(BaseModel):
    id: Optional[str] = None
    description: str = Field(min_length=2, max_length=1000)
    category: str = "Other"
    link_type: Optional[str] = None
    link_id: Optional[str] = None
    link_label: Optional[str] = None
    outcome: str = ""
    activity_id: Optional[str] = None


class Pending(BaseModel):
    description: str = Field(min_length=2)
    reason: str = ""


class ReportIn(BaseModel):
    date: str
    entries: list[Entry] = Field(default_factory=list)
    pending: list[Pending] = Field(default_factory=list)
    support_required: str = ""
    next_day_plan: str = ""
    manual_counts: dict[str, int] = Field(default_factory=dict)


async def _save(payload: ReportIn, user: dict) -> dict:
    d = _parse(payload.date)
    r = await db.daily_reports.find_one({"user_id": user["id"], "date": d.isoformat()}, {"_id": 0})
    ok, why = editable(r, d)
    if not ok:
        raise HTTPException(status_code=400, detail=why)
    if any(k not in MANUAL_COUNTS or v < 0 for k, v in payload.manual_counts.items()):
        raise HTTPException(status_code=400, detail="Only site visits, emails sent and other activities can be entered manually")
    data = {"entries": [{**e.model_dump(), "id": e.id or str(uuid.uuid4())} for e in payload.entries],
            "pending": [p.model_dump() for p in payload.pending], "support_required": payload.support_required,
            "next_day_plan": payload.next_day_plan, "manual_counts": {k: payload.manual_counts.get(k, 0) for k in MANUAL_COUNTS},
            "updated_at": now_iso()}
    if r:
        data["status"] = "DRAFT"
        await db.daily_reports.update_one({"id": r["id"]}, {"$set": data})
        rid = r["id"]
    else:
        rid = str(uuid.uuid4())
        await db.daily_reports.insert_one({"id": rid, "user_id": user["id"], "user_name": user["name"], "date": d.isoformat(), "status": "DRAFT",
                                           **data, "attachments": [], "history": [], "created_at": now_iso()})
    await audit(user, "DAILY_REPORT_SAVED", "daily_report", rid, details={"date": d.isoformat()})
    return await db.daily_reports.find_one({"id": rid}, {"_id": 0})


@router.put("/daily-reports/day")
async def save_day(payload: ReportIn, user: dict = Depends(get_current_user)):
    await _save(payload, user)
    return await _report_view(user["id"], _parse(payload.date), user)


@router.post("/daily-reports/day/submit")
async def submit_day(payload: ReportIn, user: dict = Depends(get_current_user)):
    if not [e for e in payload.entries if e.description.strip()]:
        raise HTTPException(status_code=400, detail="Add at least one activity entry before submitting")
    if len(payload.next_day_plan.strip()) < 3:
        raise HTTPException(status_code=400, detail="Next-day action plan is required")
    r = await _save(payload, user)
    d = _parse(payload.date)
    late = bool(r.get("correction_unlocked_until"))
    entry = {"action": "SUBMITTED", "by": user["id"], "by_name": user["name"], "at": now_iso(), "late_correction": late}
    await db.daily_reports.update_one({"id": r["id"]}, {"$set": {"status": "SUBMITTED", "submitted_at": now_iso(), "system_counts": await system_counts(user["id"], d),
                                                                 "corrected": late or r.get("corrected", False)}, "$unset": {"correction_unlocked_until": ""}, "$push": {"history": entry}})
    await audit(user, "DAILY_REPORT_SUBMITTED", "daily_report", r["id"], details={"date": r["date"], "correction": late})
    return await _report_view(user["id"], d, user)


@router.get("/daily-reports/mine")
async def my_reports(user: dict = Depends(get_current_user)):
    rows = {r["date"]: r async for r in db.daily_reports.find({"user_id": user["id"]}, {"_id": 0, "attachments": 0, "entries": 0}).sort("date", -1).limit(120)}
    out, d = [], today_ist()
    for _ in range(45):
        if is_working_day(d) or d.isoformat() in rows:
            r = rows.get(d.isoformat())
            out.append({"date": d.isoformat(), "status": r["status"] if r else ("NOT_STARTED" if d == today_ist() else "MISSING"), "id": (r or {}).get("id"), "corrected": (r or {}).get("corrected", False)})
        d -= timedelta(days=1)
    return out


@router.get("/daily-reports/team")
async def team_reports(date_: Optional[str] = Query(None, alias="date"), user: dict = Depends(get_current_user)):
    hod = await hod_user()
    if not (user.get("is_super_admin") or (hod and hod["id"] == user["id"])):
        raise HTTPException(status_code=403, detail="Only the HOD and Super Admin can view team daily reports")
    d = _parse(date_) if date_ else today_ist()
    users = [u async for u in db.users.find({"is_sales_contributor": True, "is_active": True, "is_test": {"$ne": True}, "is_duplicate": {"$ne": True},
                                             "is_archived": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "designation": 1, "employee_id": 1})]
    reps = {r["user_id"]: r async for r in db.daily_reports.find({"date": d.isoformat()}, {"_id": 0, "entries": 0})}
    rows = []
    for u in users:
        if u["id"] == user["id"] and not user.get("is_super_admin"):
            continue
        r = reps.get(u["id"])
        rows.append({**u, "report_id": (r or {}).get("id"), "status": r["status"] if r else ("MISSING" if d < today_ist() else "NOT_STARTED"),
                     "submitted_at": (r or {}).get("submitted_at"), "corrected": (r or {}).get("corrected", False)})
    pend = [c async for c in db.daily_corrections.find({"status": "PENDING"}, {"_id": 0}).sort("requested_at", 1)]
    return {"date": d.isoformat(), "working_day": is_working_day(d), "rows": rows, "pending_corrections": pend,
            "can_review": bool(hod) and hod["id"] == user["id"]}


class DecisionIn(BaseModel):
    comment: str = ""


@router.post("/daily-reports/{rid}/approve")
async def approve_report(rid: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _review(rid, user, "APPROVED", payload.comment)


@router.post("/daily-reports/{rid}/return")
async def return_report(rid: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _review(rid, user, "RETURNED", payload.comment)


async def _review(rid: str, user: dict, action: str, comment: str):
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    if not is_reviewer(user, await hod_user(), r["user_id"]):
        raise HTTPException(status_code=403, detail="Only the HOD can review daily reports")
    if r["status"] != "SUBMITTED":
        raise HTTPException(status_code=400, detail="Only submitted reports can be reviewed")
    if action == "RETURNED" and len(comment.strip()) < 3:
        raise HTTPException(status_code=400, detail="A reason is required to return a report")
    upd = {"status": action, "reviewed_by": user["id"], "reviewed_by_name": user["name"], "reviewed_at": now_iso(), "review_comment": comment}
    if action == "RETURNED":
        upd["correction_unlocked_until"] = (datetime.now(timezone.utc) + timedelta(hours=CORRECTION_HOURS)).isoformat()
    await db.daily_reports.update_one({"id": rid}, {"$set": upd, "$push": {"history": {"action": action, "by": user["id"], "by_name": user["name"],
                                                                                       "comment": comment, "at": now_iso()}}})
    await audit(user, f"DAILY_REPORT_{action}", "daily_report", rid, details={"user_id": r["user_id"], "date": r["date"], "comment": comment},
                previous={"status": r["status"]}, new={"status": action})
    return await db.daily_reports.find_one({"id": rid}, {"_id": 0})


# ─────────────── CORRECTIONS ───────────────
class CorrectionIn(BaseModel):
    date: str
    reason: str = Field(min_length=3)


@router.post("/daily-reports/corrections")
async def request_correction(payload: CorrectionIn, user: dict = Depends(get_current_user)):
    d = _parse(payload.date)
    r = await db.daily_reports.find_one({"user_id": user["id"], "date": d.isoformat()}, {"_id": 0})
    ok, _ = editable(r, d)
    if ok or d > today_ist():
        raise HTTPException(status_code=400, detail="This report is still editable; no correction is needed")
    if not await reviewer_for(user["id"]):
        raise HTTPException(status_code=400, detail="No HOD reviewer is configured for your reports")
    if await db.daily_corrections.find_one({"user_id": user["id"], "date": d.isoformat(), "status": "PENDING"}):
        raise HTTPException(status_code=400, detail="A correction request is already pending for this date")
    c = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"], "date": d.isoformat(), "reason": payload.reason,
         "status": "PENDING", "requested_at": now_iso()}
    await db.daily_corrections.insert_one(c)
    c.pop("_id", None)
    await audit(user, "DAILY_CORRECTION_REQUESTED", "daily_report", c["id"], details={"date": c["date"], "reason": payload.reason})
    return c


@router.get("/daily-reports/corrections/mine")
async def my_corrections(user: dict = Depends(get_current_user)):
    return [c async for c in db.daily_corrections.find({"user_id": user["id"]}, {"_id": 0}).sort("requested_at", -1).limit(50)]


async def _decide_correction(cid: str, user: dict, approve: bool, comment: str):
    c = await db.daily_corrections.find_one({"id": cid}, {"_id": 0})
    if not c or c["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Correction request not pending")
    if not is_reviewer(user, await hod_user(), c["user_id"]):
        raise HTTPException(status_code=403, detail="Only the HOD can decide correction requests")
    if not approve and len(comment.strip()) < 3:
        raise HTTPException(status_code=400, detail="A reason is required to reject")
    status = "APPROVED" if approve else "REJECTED"
    until = (datetime.now(timezone.utc) + timedelta(hours=CORRECTION_HOURS)).isoformat() if approve else None
    await db.daily_corrections.update_one({"id": cid}, {"$set": {"status": status, "decided_by": user["id"], "decided_by_name": user["name"],
                                                                 "decided_at": now_iso(), "comment": comment, "unlocked_until": until}})
    if approve:
        r = await db.daily_reports.find_one({"user_id": c["user_id"], "date": c["date"]})
        if r:
            await db.daily_reports.update_one({"id": r["id"]}, {"$set": {"correction_unlocked_until": until, "status": "DRAFT"},
                                                                "$push": {"history": {"action": "CORRECTION_APPROVED", "by": user["id"], "by_name": user["name"],
                                                                                      "comment": comment, "at": now_iso()}}})
        else:
            owner = await db.users.find_one({"id": c["user_id"]}, {"_id": 0, "name": 1})
            await db.daily_reports.insert_one({"id": str(uuid.uuid4()), "user_id": c["user_id"], "user_name": owner["name"], "date": c["date"],
                                               "status": "DRAFT", "entries": [], "pending": [], "support_required": "", "next_day_plan": "",
                                               "manual_counts": {k: 0 for k in MANUAL_COUNTS}, "attachments": [], "correction_unlocked_until": until,
                                               "history": [], "created_at": now_iso(), "updated_at": now_iso()})
    await audit(user, f"DAILY_CORRECTION_{status}", "daily_report", cid, details={"user_id": c["user_id"], "date": c["date"], "comment": comment},
                previous={"status": "PENDING"}, new={"status": status, "unlocked_until": until})
    return await db.daily_corrections.find_one({"id": cid}, {"_id": 0})


@router.post("/daily-reports/corrections/{cid}/approve")
async def approve_correction(cid: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _decide_correction(cid, user, True, payload.comment)


@router.post("/daily-reports/corrections/{cid}/reject")
async def reject_correction(cid: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _decide_correction(cid, user, False, payload.comment)


# ─────────────── ATTACHMENTS ───────────────
@router.post("/daily-reports/{rid}/attachments")
async def upload_attachment(rid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r or r["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Report not found")
    ok, why = editable(r, _parse(r["date"]))
    if not ok:
        raise HTTPException(status_code=400, detail=why)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="File type not allowed")
    data = await file.read()
    if len(data) > MAX_FILE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB")
    res = await asyncio.to_thread(put_object, f"{APP_NAME}/daily-reports/{user['id']}/{uuid.uuid4()}.{ext}", data, file.content_type or "application/octet-stream")
    att = {"id": str(uuid.uuid4()), "filename": file.filename, "storage_path": res["path"], "content_type": file.content_type,
           "size": len(data), "uploaded_at": now_iso(), "is_deleted": False}
    await db.daily_reports.update_one({"id": rid}, {"$push": {"attachments": att}})
    await audit(user, "DAILY_REPORT_ATTACHMENT_ADDED", "daily_report", rid, details={"filename": file.filename})
    return {k: v for k, v in att.items() if k != "storage_path"}


@router.delete("/daily-reports/{rid}/attachments/{aid}")
async def remove_attachment(rid: str, aid: str, user: dict = Depends(get_current_user)):
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r or r["user_id"] != user["id"] or not editable(r, _parse(r["date"]))[0]:
        raise HTTPException(status_code=400, detail="Attachment cannot be removed")
    await db.daily_reports.update_one({"id": rid, "attachments.id": aid}, {"$set": {"attachments.$.is_deleted": True}})
    await audit(user, "DAILY_REPORT_ATTACHMENT_REMOVED", "daily_report", rid, details={"attachment_id": aid})
    return {"ok": True}


@router.get("/daily-reports/{rid}/attachments/{aid}")
async def download_attachment(rid: str, aid: str, user: dict = Depends(get_current_user)):
    r = await db.daily_reports.find_one({"id": rid}, {"_id": 0})
    if not r or not await can_read(user, r["user_id"]):
        raise HTTPException(status_code=404, detail="Not found")
    att = next((a for a in r.get("attachments") or [] if a["id"] == aid and not a.get("is_deleted")), None)
    if not att:
        raise HTTPException(status_code=404, detail="Not found")
    data, ct = await asyncio.to_thread(get_object, att["storage_path"])
    return Response(content=data, media_type=att.get("content_type") or ct,
                    headers={"Content-Disposition": f'attachment; filename="{att["filename"]}"'})
