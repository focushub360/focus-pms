"""Role-aware dashboards, global search and in-app notifications."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, has_permission, require_permission
from core import db
from kpi_routes import build_scorecard, department_metrics, ensure_view
from metrics import DEPT_TARGET_KEY, OPEN_STAGES, STAGES, excluded_user_ids, fy_months, period_range, user_metrics

router = APIRouter(prefix="/api")
DEPT_VIEW = ("HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "MIS_REPORT_VIEW")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _personal_actions(uid: str) -> dict:
    now = datetime.now(timezone.utc)
    today, soon = now.date().isoformat(), (now + timedelta(days=14)).date().isoformat()
    acts = [a async for a in db.activities.find({"assigned_to": uid, "status": {"$nin": ["Completed", "Cancelled"]}}, {"_id": 0}).sort("start_at", 1)]
    open_opps = [o async for o in db.opportunities.find({"stage": {"$in": OPEN_STAGES},
                 "$or": [{"primary_owner_id": uid}, {"contributor_ids": uid}]}, {"_id": 0})]
    stale = (now - timedelta(days=14)).isoformat()
    attention = [o for o in open_opps if (o.get("next_action_date") or "9")[:10] < today or (o.get("updated_at") or "") < stale]
    deadlines = sorted([o for o in open_opps if o.get("expected_close_date") and today <= o["expected_close_date"][:10] <= soon],
                       key=lambda o: o["expected_close_date"])
    recent = [x async for x in db.audit_logs.find({"$or": [{"user_id": uid}, {"details.user_id": uid}],
                                                   "action": {"$ne": "LOGIN"}}, {"_id": 0}).sort("at", -1).limit(8)]
    slim = lambda o: {k: o.get(k) for k in ("id", "title", "account_name", "stage", "value_inr", "expected_close_date", "next_action_date", "updated_at")}
    return {
        "today": [a for a in acts if (a.get("start_at") or "")[:10] == today],
        "upcoming_meetings": [a for a in acts if a.get("activity_type") in ("Customer Meeting", "Internal Meeting") and (a.get("start_at") or "")[:10] > today][:8],
        "pending_followups": [a for a in acts if a.get("activity_type") == "Follow-up"][:8],
        "overdue": [a for a in acts if (a.get("end_at") or a.get("start_at") or "9") < now.isoformat()][:8],
        "opportunities_attention": [slim(o) for o in attention][:8],
        "upcoming_deadlines": [slim(o) for o in deadlines][:8],
        "recent_updates": recent,
    }


@router.get("/dashboard/me")
async def my_dashboard(fy_code: str = "FY2026-27", user_id: Optional[str] = None, month: Optional[str] = None,
                       quarter: Optional[str] = None, user: dict = Depends(get_current_user)):
    uid = user_id or user["id"]
    ensure_view(user, uid)
    target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Employee not found")
    s, e = period_range(fy_code, month, quarter)
    m = await user_metrics(db, uid, fy_code, s, e)
    fs, fe = period_range(fy_code)
    dept = await department_metrics(fy_code, s, e)
    rows = [r for r in dept["rows"] if r["is_active"]]
    n = len(rows) or 1
    avg = lambda k: round(sum((r.get(k) or 0) for r in rows) / n, 2)
    comparison = [
        {"metric": "Confirmed sales (₹)", "me": m["confirmed_won_inr"], "dept_avg": avg("confirmed_won_inr")},
        {"metric": "Active pipeline (₹)", "me": m["pipeline_inr"], "dept_avg": avg("pipeline_inr")},
        {"metric": "Qualified leads", "me": m["leads_qualified"], "dept_avg": avg("leads_qualified")},
        {"metric": "Meetings completed", "me": m["meetings_completed"], "dept_avg": avg("meetings_completed")},
        {"metric": "Proposals submitted", "me": m["proposals_submitted"], "dept_avg": avg("proposals_submitted")},
    ]
    ach_me, ach_avg = m["achievement_pct"], dept["team_avg_achievement_pct"]
    full_m = m if (s, e) == (fs, fe) else await user_metrics(db, uid, fy_code, fs, fe)
    scorecard = await build_scorecard(uid, fy_code, full_m, dept if (s, e) == (fs, fe) else None)
    return {
        "employee": {k: target_user.get(k) for k in ("id", "name", "designation", "functional_responsibility", "department", "email")},
        "period": {"fy_code": fy_code, "start": s, "end": e, "month": month, "quarter": quarter},
        "metrics": m,
        "fy_metrics": {"monthly_trend": full_m["monthly_trend"], "lead_trend": full_m["lead_trend"]},
        "scorecard": scorecard,
        "comparison": comparison,
        "achievement_vs_dept": {"me": ach_me, "dept_avg": ach_avg},
        "actions": await _personal_actions(uid),
        "stages": STAGES,
    }


DETAIL_VIEW = ("HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW")


async def summary_allowed() -> bool:
    s = await db.settings.find_one({"key": "visibility"}, {"_id": 0}) or {}
    return s.get("department_summary_for_employees", True)


@router.get("/settings/visibility")
async def get_visibility(user: dict = Depends(get_current_user)):
    return {"department_summary_for_employees": await summary_allowed()}


@router.put("/settings/visibility")
async def put_visibility(payload: dict, user: dict = Depends(require_permission("SYSTEM_ADMIN"))):
    from core import audit
    val = bool(payload.get("department_summary_for_employees", True))
    old = await summary_allowed()
    await db.settings.update_one({"key": "visibility"}, {"$set": {"key": "visibility", "department_summary_for_employees": val}}, upsert=True)
    await audit(user, "VISIBILITY_SETTING_CHANGED", "settings", "visibility", previous={"department_summary_for_employees": old},
                new={"department_summary_for_employees": val})
    return {"department_summary_for_employees": val}


@router.get("/dashboard/department")
async def department_dashboard(fy_code: str = "FY2026-27", month: Optional[str] = None, quarter: Optional[str] = None,
                               employee_id: Optional[str] = None, stage: Optional[str] = None, category: Optional[str] = None,
                               user: dict = Depends(get_current_user)):
    s, e = period_range(fy_code, month, quarter)
    if not any(has_permission(user, p) for p in DETAIL_VIEW):
        if not await summary_allowed():
            raise HTTPException(status_code=403, detail="Department summary is not enabled for employees")
        dept = await department_metrics(fy_code, s, e, None, stage, category)
        trend = {mm: {"month": mm, "won_inr": 0.0} for mm in fy_months(fy_code)}
        funnel = {st: {"stage": st, "count": 0, "value_inr": 0.0} for st in STAGES}
        excl = await excluded_user_ids(db)
        for r in dept["rows"]:
            for t in r["monthly_trend"]:
                trend[t["month"]]["won_inr"] += t["won_inr"]
        async for o in db.opportunities.find({"primary_owner_id": {"$nin": list(excl)}}, {"_id": 0, "stage": 1, "value_inr": 1, "service_category": 1}):
            if o.get("stage") in funnel and (not stage or o["stage"] == stage) and (not category or o.get("service_category") == category):
                funnel[o["stage"]]["count"] += 1
                funnel[o["stage"]]["value_inr"] += float(o.get("value_inr") or 0)
        keys = ("department_target_inr", "department_target_source", "confirmed_won_inr", "achievement_pct", "pipeline_inr",
                "weighted_pipeline_inr", "leads_qualified", "leads_total", "proposals_submitted", "won_count", "lost_count", "win_rate_pct")
        return {"detail": False, "period": {"start": s, "end": e}, **{k: dept[k] for k in keys}, "team_size": len(dept["rows"]),
                "monthly_trend": list(trend.values()), "funnel": list(funnel.values()), "stages": STAGES, "categories": []}
    dept = await department_metrics(fy_code, s, e, employee_id, stage, category)
    functional = []
    for r in dept["rows"]:
        sc = await build_scorecard(r["user_id"], fy_code)
        counts: dict[str, int] = {}
        for it in sc["items"]:
            counts[it["status"]] = counts.get(it["status"], 0) + 1
        functional.append({"user_id": r["user_id"], "name": r["name"], "functional_responsibility": r.get("functional_responsibility"),
                           "overall_score": sc["overall_score"], "kpi_count": len(sc["items"]), "status_counts": counts})
    opps = [o async for o in db.opportunities.find({}, {"_id": 0})]
    excl = await excluded_user_ids(db)
    opps = [o for o in opps if o.get("primary_owner_id") not in excl]
    if stage:
        opps = [o for o in opps if o.get("stage") == stage]
    if category:
        opps = [o for o in opps if o.get("service_category") == category]
    if employee_id:
        opps = [o for o in opps if o.get("primary_owner_id") == employee_id or employee_id in (o.get("contributor_ids") or [])]
    funnel = {st: {"stage": st, "count": 0, "value_inr": 0.0} for st in STAGES}
    for o in opps:
        if o.get("stage") in funnel:
            funnel[o["stage"]]["count"] += 1
            funnel[o["stage"]]["value_inr"] += float(o.get("value_inr") or 0)
    lost = [{k: o.get(k) for k in ("id", "title", "account_name", "value_inr", "primary_owner_id", "updated_at", "won_lost_reason", "lost_reason")}
            for o in opps if o.get("stage") == "Lost" and s <= (o.get("updated_at") or "")[:10] <= e]
    months = fy_months(fy_code)
    trend = {mm: {"month": mm, "won_inr": 0.0} for mm in months}
    for r in dept["rows"]:
        for t in r["monthly_trend"]:
            trend[t["month"]]["won_inr"] += t["won_inr"]
    camps = []
    async for c in db.campaigns.find({}, {"_id": 0}):
        leads = await db.leads.count_documents({"campaign_id": c["id"]})
        q = await db.leads.count_documents({"campaign_id": c["id"], "status": {"$in": ["Qualified", "Converted"]}})
        camps.append({**{k: c.get(k) for k in ("id", "name", "channel", "status", "budget_inr", "spend_inr")}, "leads": leads, "qualified_leads": q})
    pending_rev = [r async for r in db.target_revisions.find({"fy_code": fy_code, "status": "PENDING"}, {"_id": 0})]
    pending_kpi = await db.kpi_assignments.count_documents({"fy_code": fy_code, "actual_status": "SUBMITTED"})
    now = datetime.now(timezone.utc).isoformat()
    overdue = [a async for a in db.activities.find({"status": {"$nin": ["Completed", "Cancelled"]}, "end_at": {"$lt": now}}, {"_id": 0}).limit(20)]
    categories = sorted({o.get("service_category") for o in opps if o.get("service_category")})
    employees = [{"id": r["user_id"], "name": r["name"]} for r in dept["rows"]]
    return {"detail": True, "period": {"start": s, "end": e}, **dept, "functional_kpis": functional, "funnel": list(funnel.values()),
            "lost_opportunities": lost, "monthly_trend": list(trend.values()), "campaigns": camps,
            "pending_approvals": {"target_revisions": pending_rev, "kpi_actuals_to_validate": pending_kpi},
            "overdue_actions": overdue, "categories": categories, "employees": employees, "stages": STAGES}


@router.get("/dashboard/admin")
async def admin_dashboard(user: dict = Depends(require_permission("SYSTEM_ADMIN"))):
    users = [u async for u in db.users.find({}, {"_id": 0, "password_hash": 0})]
    week = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    async def missing(coll, field):
        return await db[coll].count_documents({"$or": [{field: None}, {field: ""}, {field: {"$exists": False}}]})
    total_assign = await db.kpi_assignments.count_documents({})
    no_target = await db.kpi_assignments.count_documents({"target_value": None})
    real = [u for u in users if not u.get("is_test") and not u.get("is_duplicate")]
    tgt_users = {t["user_id"] async for t in db.targets.find({}, {"user_id": 1})}
    try:
        await db.command("ping")
        health = "OK"
    except Exception:
        health = "DEGRADED"
    return {
        "users": {"total": len(users), "active": sum(1 for u in users if u.get("is_active", True)),
                  "inactive": sum(1 for u in users if not u.get("is_active", True)),
                  "test": sum(1 for u in users if u.get("is_test")), "duplicates": sum(1 for u in users if u.get("is_duplicate"))},
        "user_activity": sorted([{"id": u["id"], "name": u["name"], "email": u["email"], "last_login_at": u.get("last_login_at"),
                                  "is_active": u.get("is_active", True), "is_test": u.get("is_test", False), "is_duplicate": u.get("is_duplicate", False)}
                                 for u in users], key=lambda x: x["last_login_at"] or "", reverse=True),
        "data_completeness": [
            {"check": "Leads without email", "count": await missing("leads", "email")},
            {"check": "Leads without phone", "count": await missing("leads", "phone")},
            {"check": "Opportunities without expected close date", "count": await missing("opportunities", "expected_close_date")},
            {"check": "Accounts without primary contact", "count": await missing("accounts", "primary_contact")},
            {"check": "KPI assignments without target", "count": no_target, "of": total_assign},
            {"check": "Sales contributors without approved sales target",
             "count": sum(1 for u in real if u.get("is_sales_contributor") and u["id"] not in tgt_users)},
        ],
        "audit": {"last_7_days": await db.audit_logs.count_documents({"at": {"$gte": week}}), "total": await db.audit_logs.count_documents({})},
        "config": {"roles": await db.roles.count_documents({}), "kpi_definitions": await db.kpi_definitions.count_documents({}),
                   "kpi_assignments": total_assign, "department_target_set": bool(await db.targets.find_one({"user_id": DEPT_TARGET_KEY}))},
        "health": {"database": health},
    }


@router.get("/search")
async def global_search(q: str, user: dict = Depends(get_current_user)):
    if len(q.strip()) < 2:
        return {"leads": [], "accounts": [], "opportunities": [], "users": []}
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    own = not user.get("is_super_admin") and user.get("data_visibility", "OWN") == "OWN"
    def scope(extra: dict, owner_field="owner_id"):
        return {"$and": [extra, {owner_field: user["id"]}]} if own else extra
    out = {"leads": [], "accounts": [], "opportunities": [], "users": []}
    if has_permission(user, "SALES_LEAD_MANAGE"):
        out["leads"] = [x async for x in db.leads.find(scope({"$or": [{"name": rx}, {"company": rx}, {"lead_code": rx}]}), {"_id": 0, "id": 1, "name": 1, "company": 1, "status": 1}).limit(6)]
    if has_permission(user, "SALES_ACCOUNT_MANAGE"):
        out["accounts"] = [x async for x in db.accounts.find(scope({"$or": [{"name": rx}, {"city": rx}]}), {"_id": 0, "id": 1, "name": 1, "city": 1}).limit(6)]
    if has_permission(user, "SALES_OPPORTUNITY_MANAGE"):
        f = {"$or": [{"title": rx}, {"account_name": rx}]}
        if own:
            f = {"$and": [f, {"$or": [{"primary_owner_id": user["id"]}, {"contributor_ids": user["id"]}]}]}
        out["opportunities"] = [x async for x in db.opportunities.find(f, {"_id": 0, "id": 1, "title": 1, "account_name": 1, "stage": 1}).limit(6)]
    out["users"] = [x async for x in db.users.find({"$or": [{"name": rx}, {"email": rx}], "is_duplicate": {"$ne": True}, "is_test": {"$ne": True}},
                                                   {"_id": 0, "id": 1, "name": 1, "designation": 1}).limit(6)]
    return out


@router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    items = []
    now = datetime.now(timezone.utc).isoformat()
    if has_permission(user, "TARGETS_APPROVE"):
        n = await db.target_revisions.count_documents({"status": "PENDING", "user_id": {"$ne": user["id"]}})
        if n:
            items.append({"type": "APPROVAL", "title": f"{n} target revision(s) awaiting approval", "link": "/app/targets?tab=targets"})
    if has_permission(user, "KPI_ACTUAL_VALIDATE"):
        n = await db.kpi_assignments.count_documents({"actual_status": "SUBMITTED", "user_id": {"$ne": user["id"]}})
        if n:
            items.append({"type": "VALIDATION", "title": f"{n} KPI actual(s) awaiting validation", "link": "/app/targets?tab=assignments"})
    n = await db.activities.count_documents({"assigned_to": user["id"], "status": {"$nin": ["Completed", "Cancelled"]}, "end_at": {"$lt": now}})
    if n:
        items.append({"type": "OVERDUE", "title": f"{n} overdue activit{'y' if n == 1 else 'ies'}", "link": "/app/dashboard"})
    week = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    async for r in db.target_revisions.find({"user_id": user["id"], "status": {"$in": ["APPROVED", "REJECTED"]}, "decided_at": {"$gte": week}}, {"_id": 0}):
        items.append({"type": "TARGET", "title": f"Your target revision was {r['status'].lower()}", "link": "/app/targets"})
    manual_ids = [d["code"] async for d in db.kpi_definitions.find({"data_source": "MANUAL"}, {"code": 1})]
    n = await db.kpi_assignments.count_documents({"user_id": user["id"], "is_active": True, "kpi_code": {"$in": manual_ids},
                                                  "target_value": {"$ne": None}, "actual_value": None})
    if n:
        items.append({"type": "KPI", "title": f"{n} assigned KPI(s) need your actual update", "link": "/app/targets"})
    async for x in db.notifications.find({"user_id": user["id"], "read": {"$ne": True}}, {"_id": 0}).sort("at", -1).limit(20):
        items.append(x)
    return items


@router.get("/meta/employees")
async def employee_options(user: dict = Depends(get_current_user)):
    """Employees selectable for performance views (respects permissions)."""
    excl = await excluded_user_ids(db)
    if not any(has_permission(user, p) for p in ("TARGETS_CONFIGURE", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW")):
        return [{"id": user["id"], "name": user["name"], "designation": user.get("designation")}]
    return [{"id": u["id"], "name": u["name"], "designation": u.get("designation"), "is_active": u.get("is_active", True)}
            async for u in db.users.find({"is_sales_contributor": True}, {"_id": 0}) if u["id"] not in excl]
