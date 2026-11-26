"""Calendar & Activities: events stored in `activities` (feeds dashboard metrics) + system meeting schedule."""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, has_permission
from core import audit, db, now_iso

router = APIRouter(prefix="/api")
IST = ZoneInfo("Asia/Kolkata")
TYPES = ["Meeting", "Customer Meeting", "Sales Call", "Follow-up", "Task", "Project Deadline", "Reminder", "Appointment"]
STATUSES = ["Planned", "Completed", "Cancelled"]


def timeof_ist(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(IST).strftime("%d %b %I:%M %p")


def full_view(user: dict) -> bool:
    return bool(user.get("is_super_admin")) or has_permission(user, "HOD_VIEW")


def is_working_day(d: date) -> bool:
    return d.weekday() < 5 or (d.weekday() == 5 and not 8 <= d.day <= 14)


def ist_dt(d: date, h: int, m: int) -> str:
    return datetime.combine(d, time(h, m), IST).astimezone(ZoneInfo("UTC")).isoformat()


def system_events(start: date, end: date) -> list[dict]:
    out, d = [], start
    while d <= end:
        if is_working_day(d):
            out.append({"id": f"sys-dsm-{d}", "title": "Daily Sales Meeting", "activity_type": "Meeting", "start_at": ist_dt(d, 10, 0),
                        "end_at": ist_dt(d, 10, 30), "visibility": "TEAM", "status": "Planned", "system": True,
                        "notes": "Mon–Sat (except 2nd Saturday), 10:00–10:30 AM IST"})
        if d.day in (2, 16):
            out.append({"id": f"sys-fr-{d}", "title": "Fortnightly Performance Review", "activity_type": "Meeting", "start_at": ist_dt(d, 11, 0),
                        "end_at": ist_dt(d, 12, 0), "visibility": "TEAM", "status": "Planned", "system": True,
                        "notes": "Held on the 2nd and 16th of every month"})
        d += timedelta(days=1)
    return out


def _busy(e: dict) -> dict:
    return {"id": e["id"], "title": "Busy", "busy": True, "start_at": e["start_at"], "end_at": e["end_at"], "all_day": e.get("all_day", False),
            "assigned_to": e["assigned_to"], "activity_type": "Busy", "visibility": "PRIVATE"}


def can_edit(user: dict, e: dict) -> bool:
    return e["assigned_to"] == user["id"] or e.get("created_by") == user["id"]


@router.get("/calendar/meta")
async def calendar_meta(user: dict = Depends(get_current_user)):
    people = [{"id": u["id"], "name": u["name"]} async for u in db.users.find(
        {"is_active": True, "is_test": {"$ne": True}, "is_duplicate": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1})]
    return {"types": TYPES, "statuses": STATUSES, "people": people, "full_view": full_view(user)}


@router.get("/calendar/events")
async def list_events(start: str, end: str, scope: str = "mine", user_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    s, e = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
    if (e - s).days > 400:
        raise HTTPException(status_code=400, detail="Range too large")
    rs, re_ = ist_dt(s, 0, 0), ist_dt(e + timedelta(days=1), 0, 0)
    flt = {"start_at": {"$lt": re_}, "end_at": {"$gte": rs}}
    rows = [x async for x in db.activities.find(flt, {"_id": 0})]
    mine = lambda x: x["assigned_to"] == user["id"] or user["id"] in (x.get("attendee_ids") or []) or x.get("created_by") == user["id"]  # noqa: E731
    out = []
    for x in rows:
        if user_id and x["assigned_to"] != user_id and user_id not in (x.get("attendee_ids") or []):
            continue
        if mine(x) or (full_view(user) and scope == "team"):
            out.append(x)
        elif scope == "team":
            out.append(x if x.get("visibility") == "TEAM" else _busy(x))
        elif x.get("visibility") == "TEAM" and user["id"] in (x.get("attendee_ids") or []):
            out.append(x)
    return out + system_events(s, e)


class RecurrenceIn(BaseModel):
    freq: str = Field(pattern="^(WEEKLY|MONTHLY)$")
    until: str
    interval: int = Field(default=1, ge=1, le=4)


def _shift(dt: datetime, freq: str, k: int) -> datetime:
    if freq == "WEEKLY":
        return dt + timedelta(weeks=k)
    m = dt.month - 1 + k
    y, m = dt.year + m // 12, m % 12 + 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return dt.replace(year=y, month=m, day=min(dt.day, last))


class EventIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    activity_type: str
    start_at: str
    end_at: str
    all_day: bool = False
    visibility: str = "PRIVATE"
    status: str = "Planned"
    priority: Optional[str] = "Normal"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    timeframe: Optional[str] = None
    calendar_date: Optional[str] = None
    metric_target: Optional[int] = None
    metric_current: Optional[int] = None
    target_note: Optional[str] = None
    assigned_to: Optional[str] = None
    attendee_ids: list[str] = Field(default_factory=list)
    location: str = ""
    notes: str = ""
    outcome: str = ""
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    reminder_minutes: Optional[int] = Field(default=None, ge=0, le=10080)
    recurrence: Optional[RecurrenceIn] = None


class TaskProgressIn(BaseModel):
    status: Optional[str] = None
    metric_current: Optional[int] = None
    metric_target: Optional[int] = None


def _validate(p: EventIn) -> None:
    if p.activity_type not in TYPES or p.status not in STATUSES or p.visibility not in ("TEAM", "PRIVATE"):
        raise HTTPException(status_code=400, detail="Invalid type, status or visibility")
    try:
        sa, ea = datetime.fromisoformat(p.start_at), datetime.fromisoformat(p.end_at)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date/time")
    if ea < sa:
        raise HTTPException(status_code=400, detail="End must be after start")


async def _norm(p: EventIn, user: dict, current_owner: Optional[str] = None) -> dict:
    d = p.model_dump(exclude={"recurrence"})
    owner = d.pop("assigned_to") or current_owner or user["id"]
    if owner not in (user["id"], current_owner) and not full_view(user):
        raise HTTPException(status_code=403, detail="You can only create activities for yourself")
    d["start_at"] = datetime.fromisoformat(p.start_at).astimezone(ZoneInfo("UTC")).isoformat()
    d["end_at"] = datetime.fromisoformat(p.end_at).astimezone(ZoneInfo("UTC")).isoformat()
    d["assigned_to"] = owner
    d["attendee_ids"] = sorted(set(p.attendee_ids) - {owner})
    return d


@router.post("/calendar/events")
async def create_event(payload: EventIn, user: dict = Depends(get_current_user)):
    _validate(payload)
    base = await _norm(payload, user)
    rec = payload.recurrence
    sa, ea = datetime.fromisoformat(base["start_at"]), datetime.fromisoformat(base["end_at"])
    starts = [sa]
    series_id = None
    if rec:
        until = datetime.combine(date.fromisoformat(rec.until[:10]), time(23, 59), IST)
        k = rec.interval
        while len(starts) < 60 and _shift(sa, rec.freq, k) <= until:
            starts.append(_shift(sa, rec.freq, k))
            k += rec.interval
        if len(starts) < 2:
            raise HTTPException(status_code=400, detail="Repeat-until date must allow at least two occurrences")
        series_id = str(uuid.uuid4())
    docs = []
    for st in starts:
        docs.append({"id": str(uuid.uuid4()), **base, "start_at": st.isoformat(), "end_at": (st + (ea - sa)).isoformat(),
                     "series_id": series_id, "recurrence": rec.model_dump() if rec else None, "created_by": user["id"],
                     "created_at": now_iso(), "updated_at": now_iso(), "completed_at": now_iso() if payload.status == "Completed" else None})
    await db.activities.insert_many(docs)
    for d in docs:
        d.pop("_id", None)
    await audit(user, "ACTIVITY_CREATED", "activity", docs[0]["id"], new={"title": base["title"], "type": base["activity_type"], "start_at": docs[0]["start_at"],
                                                                         "occurrences": len(docs), "series_id": series_id})
    return docs[0]


@router.patch("/calendar/events/{eid}")
async def update_event(eid: str, payload: EventIn, scope: str = "this", user: dict = Depends(get_current_user)):
    old = await db.activities.find_one({"id": eid}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not can_edit(user, old):
        raise HTTPException(status_code=403, detail="Only the owner can edit this activity")
    _validate(payload)
    d = await _norm(payload, user, old["assigned_to"])
    d["updated_at"] = now_iso()
    if d["start_at"] != old["start_at"] or d.get("reminder_minutes") != old.get("reminder_minutes"):
        d["reminder_sent"] = False
    if scope == "series" and old.get("series_id"):
        delta = datetime.fromisoformat(d["start_at"]) - datetime.fromisoformat(old["start_at"])
        dur = datetime.fromisoformat(d["end_at"]) - datetime.fromisoformat(d["start_at"])
        common = {k: v for k, v in d.items() if k not in ("start_at", "end_at", "status", "outcome")}
        n = 0
        async for o in db.activities.find({"series_id": old["series_id"], "status": {"$ne": "Completed"}}, {"_id": 0}):
            st = datetime.fromisoformat(o["start_at"]) + delta
            await db.activities.update_one({"id": o["id"]}, {"$set": {**common, "start_at": st.isoformat(), "end_at": (st + dur).isoformat()}})
            n += 1
        await audit(user, "ACTIVITY_SERIES_UPDATED", "activity", old["series_id"], details={"occurrences": n}, new={"title": d["title"]})
        return await db.activities.find_one({"id": eid}, {"_id": 0})
    if d["status"] == "Completed" and old.get("status") != "Completed":
        d["completed_at"] = now_iso()
    if old.get("series_id"):
        d["series_exception"] = True
    await db.activities.update_one({"id": eid}, {"$set": d})
    changed = {k: old.get(k) for k in d if k != "updated_at" and old.get(k) != d[k]}
    await audit(user, "ACTIVITY_UPDATED", "activity", eid, previous=changed, new={k: d[k] for k in changed})
    return await db.activities.find_one({"id": eid}, {"_id": 0})


@router.patch("/calendar/events/{eid}/task-progress")
async def update_task_progress(eid: str, payload: TaskProgressIn, user: dict = Depends(get_current_user)):
    old = await db.activities.find_one({"id": eid}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not can_edit(user, old) and not full_view(user):
        raise HTTPException(status_code=403, detail="Not authorized to edit this")
    up = {"updated_at": now_iso()}
    if payload.status:
        up["status"] = payload.status
        if payload.status == "Completed" and old.get("status") != "Completed":
            up["completed_at"] = now_iso()
    if payload.metric_current is not None:
        up["metric_current"] = payload.metric_current
    if payload.metric_target is not None:
        up["metric_target"] = payload.metric_target
    await db.activities.update_one({"id": eid}, {"$set": up})
    return await db.activities.find_one({"id": eid}, {"_id": 0})


@router.delete("/calendar/events/{eid}")
async def delete_event(eid: str, scope: str = "this", user: dict = Depends(get_current_user)):
    old = await db.activities.find_one({"id": eid}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not can_edit(user, old):
        raise HTTPException(status_code=403, detail="Only the owner can delete this activity")
    if scope == "series" and old.get("series_id"):
        res = await db.activities.delete_many({"series_id": old["series_id"], "status": {"$ne": "Completed"}})
        await audit(user, "ACTIVITY_SERIES_DELETED", "activity", old["series_id"], details={"deleted": res.deleted_count, "title": old["title"]})
        return {"ok": True, "deleted": res.deleted_count}
    if old.get("status") == "Completed":
        raise HTTPException(status_code=400, detail="Completed activities count toward KPIs and cannot be deleted; cancel instead")
    await db.activities.delete_one({"id": eid})
    await audit(user, "ACTIVITY_DELETED", "activity", eid, previous={"title": old["title"], "start_at": old["start_at"]})
    return {"ok": True, "deleted": 1}


# ──────────────── DAILY TASK PROGRESS SUBMISSION (SRD) ────────────────
class TaskSubmitItemIn(BaseModel):
    task_id: str
    description: str = Field(min_length=1, max_length=300)
    timeframe: Optional[str] = None
    priority: str = "Normal"
    target_note: Optional[str] = None
    completed: bool = False


class TaskSubmissionIn(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    tasks: list[TaskSubmitItemIn] = Field(default_factory=list)


@router.get("/calendar/tasks/submissions")
async def list_task_submissions(
    date: str,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user_id or user["id"]
    if uid != user["id"] and not full_view(user):
        raise HTTPException(status_code=403, detail="Not authorised to view another employee's task submissions")
    history = [
        s async for s in db.daily_task_submissions.find(
            {"user_id": uid, "date": date},
            {"_id": 0},
        ).sort("submitted_at", -1)
    ]
    return {"date": date, "user_id": uid, "latest": history[0] if history else None, "history": history}


@router.get("/calendar/tasks/submissions/review")
async def review_task_submissions(
    date: Optional[str] = None,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    flt: dict = {}
    if date:
        flt["date"] = date
    if not full_view(user):
        flt["user_id"] = user["id"]
    elif user_id:
        flt["user_id"] = user_id
    return [s async for s in db.daily_task_submissions.find(flt, {"_id": 0}).sort("submitted_at", -1).limit(200)]


@router.post("/calendar/tasks/submit")
async def submit_daily_task_progress(
    payload: TaskSubmissionIn,
    user: dict = Depends(get_current_user),
):
    valid_tasks = [t for t in payload.tasks if (t.timeframe or "").strip()]
    if not valid_tasks:
        raise HTTPException(
            status_code=400,
            detail="Add at least one valid task with a defined timeframe before submitting daily progress.",
        )

    total_tasks = len(valid_tasks)
    completed_tasks = sum(1 for t in valid_tasks if t.completed)
    uncleared_tasks = total_tasks - completed_tasks
    completion_pct = round((completed_tasks / total_tasks) * 100.0, 2)
    submitted_at = now_iso()

    # Persist checkbox completion states back on matching owned calendar activities (KPI actuals remain untouched)
    for t in valid_tasks:
        existing = await db.activities.find_one({"id": t.task_id}, {"_id": 0})
        if existing and can_edit(user, existing):
            next_status = "Completed" if t.completed else "Planned"
            upd = {"status": next_status, "updated_at": submitted_at}
            if next_status == "Completed" and existing.get("status") != "Completed":
                upd["completed_at"] = submitted_at
            await db.activities.update_one({"id": t.task_id}, {"$set": upd})

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "date": payload.date,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "uncleared_tasks": uncleared_tasks,
        "completion_pct": completion_pct,
        "submitted_at": submitted_at,
        "tasks": [
            {
                "task_id": t.task_id,
                "description": t.description.strip(),
                "timeframe": (t.timeframe or "").strip(),
                "priority": t.priority or "Normal",
                "target_note": (t.target_note or "").strip() or None,
                "completed": bool(t.completed),
            }
            for t in valid_tasks
        ],
    }
    await db.daily_task_submissions.insert_one(doc)
    doc.pop("_id", None)

    await audit(
        user,
        "DAILY_TASK_PROGRESS_SUBMITTED",
        "daily_task_submission",
        doc["id"],
        details={
            "date": payload.date,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "uncleared_tasks": uncleared_tasks,
            "completion_pct": completion_pct,
        },
    )

    history = [
        s async for s in db.daily_task_submissions.find(
            {"user_id": user["id"], "date": payload.date},
            {"_id": 0},
        ).sort("submitted_at", -1)
    ]
    return {"latest": doc, "history": history}
