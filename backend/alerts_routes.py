"""Scheduled alerts: activity reminders, 9 PM missed-report alerts, HOD morning summary. In-app + email."""
from __future__ import annotations

import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request

from activity_routes import IST, is_working_day, timeof_ist
from auth import get_current_user
from core import db, now_iso
from email_service import _wrap, send_email
from phase2_routes import hod_user

router = APIRouter(prefix="/api")
log = logging.getLogger("alerts")
APP_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")


async def notify(user: dict, kind: str, title: str, link: str, key: str, email_html: str | None = None) -> bool:
    """Idempotent per key: creates an in-app notification and optionally an email."""
    if await db.notifications.find_one({"dedupe_key": key}):
        return False
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "type": kind, "title": title, "link": link, "read": False,
           "dedupe_key": key, "at": now_iso(), "email_status": None}
    await db.notifications.insert_one(doc)
    if email_html and user.get("email"):
        try:
            await send_email(to=user["email"], subject=title, html=_wrap(title, email_html))
            status = "SENT"
        except Exception as e:  # email failure must not block in-app alert
            log.warning(f"alert email failed for {user['email']}: {e}")
            status = "FAILED"
        await db.notifications.update_one({"id": doc["id"]}, {"$set": {"email_status": status}})
    return True


def _link(path: str, label: str) -> str:
    return f'<p><a href="{APP_URL}{path}" style="color:#264494;font-weight:bold;">{escape(label)}</a></p>' if APP_URL.startswith("https://") else ""


async def run_reminders() -> int:
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(days=1, minutes=15)).isoformat()
    n = 0
    async for a in db.activities.find({"reminder_minutes": {"$ne": None}, "status": "Planned", "reminder_sent": {"$ne": True},
                                       "start_at": {"$gt": now.isoformat(), "$lte": horizon}}, {"_id": 0}):
        remind_at = datetime.fromisoformat(a["start_at"]) - timedelta(minutes=a["reminder_minutes"])
        if remind_at > now + timedelta(minutes=10):
            continue
        when = timeof_ist(a["start_at"])
        for uid in [a["assigned_to"], *(a.get("attendee_ids") or [])]:
            u = await db.users.find_one({"id": uid, "is_active": True}, {"_id": 0, "password_hash": 0})
            if u:
                html = f"<p>Hi {escape(u['name'])},</p><p><b>{escape(a['title'])}</b> ({escape(a['activity_type'])}) starts at {when} IST.</p>" + _link("/app/calendar", "Open calendar")
                n += await notify(u, "REMINDER", f"Reminder: {a['title']} at {when}", "/app/calendar", f"rem:{a['id']}:{uid}:{a['start_at']}", html)
        await db.activities.update_one({"id": a["id"]}, {"$set": {"reminder_sent": True}})
    return n


async def _report_users():
    async for u in db.users.find({"is_sales_contributor": True, "is_active": True, "is_test": {"$ne": True}, "is_duplicate": {"$ne": True},
                                  "is_archived": {"$ne": True}}, {"_id": 0, "password_hash": 0}):
        yield u


async def run_missed() -> int:
    d = datetime.now(IST).date()
    if not is_working_day(d):
        return 0
    n = 0
    async for u in _report_users():
        r = await db.daily_reports.find_one({"user_id": u["id"], "date": d.isoformat()}, {"status": 1})
        if r and r["status"] in ("SUBMITTED", "APPROVED"):
            continue
        html = f"<p>Hi {escape(u['name'])},</p><p>Your daily activity report for <b>{d.isoformat()}</b> has not been submitted. It locks at 11:59:59 PM IST tonight.</p>" + _link("/app/daily-activity", "Submit daily report")
        n += await notify(u, "DAILY_REPORT", f"Daily report for {d.isoformat()} not submitted — locks at midnight", "/app/daily-activity", f"missed:{u['id']}:{d}", html)
    return n


async def run_hod_summary() -> int:
    hod = await hod_user()
    if not hod:
        return 0
    d = datetime.now(IST).date() - timedelta(days=1)
    while not is_working_day(d):
        d -= timedelta(days=1)
    pending = []
    async for u in _report_users():
        if u["id"] == hod["id"]:
            continue
        r = await db.daily_reports.find_one({"user_id": u["id"], "date": d.isoformat()}, {"status": 1})
        if not r or r["status"] not in ("SUBMITTED", "APPROVED"):
            pending.append((u["name"], r["status"] if r else "MISSING"))
    awaiting = await db.daily_reports.count_documents({"date": d.isoformat(), "status": "SUBMITTED"})
    title = f"Daily reports {d.isoformat()}: {len(pending)} pending, {awaiting} awaiting your review"
    rows = "".join(f"<li>{escape(n)} — {s}</li>" for n, s in pending) or "<li>All mandatory reports submitted.</li>"
    html = f"<p>Hi {escape(hod['name'])},</p><p>Summary for <b>{d.isoformat()}</b>:</p><ul>{rows}</ul><p>{awaiting} submitted report(s) await your review.</p>" + _link("/app/daily-activity?tab=team", "Review team reports")
    return int(await notify(hod, "DAILY_SUMMARY", title, "/app/daily-activity?tab=team", f"hodsum:{d}", html))


JOBS = {"activity-reminders": run_reminders, "missed-reports": run_missed, "hod-summary": run_hod_summary}


async def _run(job: str, run_id: str):
    try:
        n = await JOBS[job]()
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "DONE", "sent": n, "finished_at": now_iso()}})
    except Exception as e:
        log.exception(f"cron {job} failed")
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "FAILED", "error": str(e)[:300]}})


@router.post("/cron/{job}")
async def cron_hook(job: str, request: Request, bg: BackgroundTasks, authorization: str = Header(None), x_webhook_id: str = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret or not authorization or not authorization.startswith("Bearer ") or not hmac.compare_digest(authorization[7:], secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if job not in JOBS:
        raise HTTPException(status_code=404, detail="Unknown job")
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = x_webhook_id or body.get("run_id") or str(uuid.uuid4())
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "job": job, "status": "QUEUED", "at": now_iso()})
    bg.add_task(_run, job, run_id)
    return {"ok": True}


@router.post("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}
