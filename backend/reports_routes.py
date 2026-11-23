"""Reports & Analytics with role-based scope and CSV / Excel / PDF export. All figures from live records."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from activity_routes import IST, is_working_day
from auth import get_current_user, has_permission
from core import db
from kpi_routes import build_scorecard
from metrics import excluded_user_ids, in_range, share_of, user_metrics

router = APIRouter(prefix="/api")
REPORTS = {
    "sales-performance": "Sales performance by employee",
    "pipeline": "Pipeline by stage and service",
    "lead-sources": "Lead sources and conversion",
    "activities": "Activities and daily report compliance",
    "kpi-scorecards": "KPI scorecards",
    "campaigns": "Campaign performance",
}


def detail_scope(user: dict) -> bool:
    return bool(user.get("is_super_admin")) or has_permission(user, "HOD_VIEW")


async def _people(user: dict, employee: Optional[str]) -> list[dict]:
    excl = await excluded_user_ids(db)
    us = [u async for u in db.users.find({"is_sales_contributor": True, "is_archived": {"$ne": True}}, {"_id": 0, "password_hash": 0}) if u["id"] not in excl]
    if employee:
        us = [u for u in us if u["id"] == employee]
    return us


def _fy(start: str) -> str:
    y, m = int(start[:4]), int(start[5:7])
    s = y if m >= 4 else y - 1
    return f"FY{s}-{str(s + 1)[2:]}"


def _total(rows: list[dict], cols: list[tuple], label_key: str) -> dict:
    t = {label_key: "Department total"}
    for k, _ in cols:
        vals = [r.get(k) for r in rows if isinstance(r.get(k), (int, float))]
        if vals and not k.endswith("_pct") and k != "overall_score":
            t[k] = round(sum(vals), 2)
        elif vals:
            t[k] = round(sum(vals) / len(vals), 2)
    return t


def _scope(rows: list[dict], cols, user: dict, label_key: str = "employee") -> list[dict]:
    """Employees: own detailed row + department aggregate only."""
    tot = _total(rows, cols, label_key)
    if detail_scope(user):
        return rows + [tot]
    return [r for r in rows if r.get("_uid") == user["id"]] + [tot]


async def sales_performance(f: dict, user: dict):
    cols = [("employee", "Employee"), ("target_inr", "Target (₹)"), ("confirmed_won_inr", "Confirmed won (₹)"), ("achievement_pct", "Achievement %"),
            ("pipeline_inr", "Pipeline (₹)"), ("weighted_pipeline_inr", "Weighted pipeline (₹)"), ("won_count", "Won"), ("lost_count", "Lost"),
            ("win_rate_pct", "Win rate %"), ("proposals_submitted", "Proposals"), ("leads_total", "Leads"), ("leads_qualified", "Qualified leads")]
    opps = [o async for o in db.opportunities.find({}, {"_id": 0})]
    rows = []
    for u in await _people(user, f["employee"]):
        m = await user_metrics(db, u["id"], _fy(f["start"]), f["start"], f["end"], opps, f["stage"], f["service"])
        rows.append({"_uid": u["id"], "employee": u["name"], **{k: m.get(k) for k, _ in cols[1:]}})
    return cols, _scope(rows, cols, user)


async def pipeline(f: dict, user: dict):
    cols = [("stage", "Stage"), ("service", "Service category"), ("count", "Opportunities"), ("value_inr", "Value (₹)"), ("weighted_inr", "Weighted (₹)")]
    excl = await excluded_user_ids(db)
    groups: dict = {}
    mine_only = not detail_scope(user)
    async for o in db.opportunities.find({}, {"_id": 0}):
        if o.get("primary_owner_id") in excl or not in_range((o.get("created_at") or "")[:10], f["start"], f["end"]):
            continue
        if (f["stage"] and o.get("stage") != f["stage"]) or (f["service"] and o.get("service_category") != f["service"]):
            continue
        uid = f["employee"] or (user["id"] if mine_only else None)
        share = share_of(o, uid) / 100 if uid else 1
        if uid and share <= 0:
            continue
        g = groups.setdefault((o.get("stage"), o.get("service_category") or "—"), {"stage": o.get("stage"), "service": o.get("service_category") or "—", "count": 0, "value_inr": 0, "weighted_inr": 0})
        g["count"] += 1
        g["value_inr"] = round(g["value_inr"] + (o.get("value_inr") or 0) * share, 2)
        g["weighted_inr"] = round(g["weighted_inr"] + (o.get("value_inr") or 0) * share * (o.get("probability") or 0) / 100, 2)
    rows = sorted(groups.values(), key=lambda x: (x["stage"] or "", x["service"]))
    return cols, rows + [_total(rows, cols, "stage")]


async def lead_sources(f: dict, user: dict):
    cols = [("source", "Source"), ("leads", "Leads"), ("qualified", "Qualified"), ("converted", "Converted to opportunity"), ("conversion_pct", "Conversion %")]
    excl = await excluded_user_ids(db)
    conv = {o.get("lead_id") async for o in db.opportunities.find({"lead_id": {"$nin": [None, ""]}}, {"lead_id": 1})}
    owner = f["employee"] or (None if detail_scope(user) else user["id"])
    g: dict = {}
    async for lead in db.leads.find({}, {"_id": 0}):
        if lead.get("owner_id") in excl or (owner and lead.get("owner_id") != owner) or not in_range((lead.get("created_at") or "")[:10], f["start"], f["end"]):
            continue
        r = g.setdefault(lead.get("source") or "—", {"source": lead.get("source") or "—", "leads": 0, "qualified": 0, "converted": 0})
        r["leads"] += 1
        r["qualified"] += lead.get("status") in ("Qualified", "Converted")
        r["converted"] += lead["id"] in conv
    rows = sorted(g.values(), key=lambda x: -x["leads"])
    for r in rows:
        r["conversion_pct"] = round(r["converted"] / r["leads"] * 100, 2) if r["leads"] else None
    tot = _total(rows, cols, "source")
    tot["conversion_pct"] = round(tot.get("converted", 0) / tot["leads"] * 100, 2) if tot.get("leads") else None
    return cols, rows + [tot]


async def activities(f: dict, user: dict):
    cols = [("employee", "Employee"), ("calls", "Sales calls"), ("meetings", "Customer meetings"), ("follow_ups", "Follow-ups"), ("tasks", "Tasks"),
            ("planned", "Planned"), ("overdue", "Overdue"), ("working_days", "Working days"), ("reports_submitted", "Reports submitted"),
            ("reports_approved", "Reports approved"), ("reports_missing", "Reports missing"), ("compliance_pct", "Report compliance %")]
    s, e = date.fromisoformat(f["start"]), min(date.fromisoformat(f["end"]), datetime.now(IST).date())
    wdays = [d.isoformat() for d in (s + timedelta(n) for n in range(max((e - s).days + 1, 0))) if is_working_day(d)]
    from core import now_iso
    now = now_iso()
    rows = []
    for u in await _people(user, f["employee"]):
        acts = [a async for a in db.activities.find({"assigned_to": u["id"], "start_at": {"$gte": f["start"], "$lte": f["end"] + "T23:59:59"}}, {"_id": 0})]
        done = lambda t: sum(1 for a in acts if a["activity_type"] == t and a["status"] == "Completed")  # noqa: E731
        reps = {r["date"]: r["status"] async for r in db.daily_reports.find({"user_id": u["id"], "date": {"$in": wdays}}, {"date": 1, "status": 1})}
        sub = sum(1 for d in wdays if reps.get(d) in ("SUBMITTED", "APPROVED"))
        rows.append({"_uid": u["id"], "employee": u["name"], "calls": done("Sales Call"), "meetings": done("Customer Meeting"), "follow_ups": done("Follow-up"),
                     "tasks": done("Task"), "planned": sum(1 for a in acts if a["status"] == "Planned"),
                     "overdue": sum(1 for a in acts if a["status"] == "Planned" and a["end_at"] < now), "working_days": len(wdays),
                     "reports_submitted": sub, "reports_approved": sum(1 for d in wdays if reps.get(d) == "APPROVED"),
                     "reports_missing": len(wdays) - sub, "compliance_pct": round(sub / len(wdays) * 100, 2) if wdays else None})
    return cols, _scope(rows, cols, user)


async def kpi_scorecards(f: dict, user: dict):
    cols = [("employee", "Employee"), ("core_kpis", "Core KPIs"), ("core_weight", "Core weight %"), ("overall_score", "Weighted score %"),
            ("achieved", "Achieved"), ("at_risk", "At risk / below"), ("latest_month", "Latest monthly card"), ("latest_status", "Status")]
    rows = []
    for u in await _people(user, f["employee"]):
        sc = await build_scorecard(u["id"], _fy(f["start"]))
        core = [i for i in sc["items"] if i.get("is_core")]
        last = await db.monthly_scorecards.find_one({"user_id": u["id"]}, {"_id": 0, "month": 1, "status": 1}, sort=[("month", -1)])
        rows.append({"_uid": u["id"], "employee": u["name"], "core_kpis": len(core), "core_weight": sum(i.get("weightage") or 0 for i in core),
                     "overall_score": sc["overall_score"], "achieved": sum(1 for i in core if i["status"] == "ACHIEVED"),
                     "at_risk": sum(1 for i in core if i["status"] in ("AT_RISK", "BELOW_TARGET")),
                     "latest_month": (last or {}).get("month", "—"), "latest_status": (last or {}).get("status", "—")})
    return cols, _scope(rows, cols, user)


async def campaigns(f: dict, user: dict):
    cols = [("campaign", "Campaign"), ("channel", "Channel"), ("status", "Status"), ("budget_inr", "Budget (₹)"), ("spend_inr", "Spend (₹)"),
            ("leads", "Leads"), ("qualified", "Qualified"), ("won_inr", "Attributed won (₹)"), ("cost_per_lead", "Cost per lead (₹)")]
    rows = []
    async for c in db.campaigns.find({}, {"_id": 0}):
        if c.get("start_date") and c["start_date"][:10] > f["end"]:
            continue
        leads = [x async for x in db.leads.find({"campaign_id": c["id"]}, {"_id": 0, "id": 1, "status": 1})]
        ids = [x["id"] for x in leads]
        won = sum([o.get("value_inr") or 0 async for o in db.opportunities.find({"lead_id": {"$in": ids}, "stage": "Won"}, {"value_inr": 1})]) if ids else 0
        rows.append({"campaign": c["name"], "channel": c.get("channel"), "status": c.get("status"), "budget_inr": c.get("budget_inr") or 0,
                     "spend_inr": c.get("spend_inr") or 0, "leads": len(leads), "qualified": sum(1 for x in leads if x.get("status") in ("Qualified", "Converted")),
                     "won_inr": round(won, 2), "cost_per_lead": round((c.get("spend_inr") or 0) / len(leads), 2) if leads else None})
    return cols, rows + [_total(rows, cols, "campaign")]


FN = {"sales-performance": sales_performance, "pipeline": pipeline, "lead-sources": lead_sources, "activities": activities,
      "kpi-scorecards": kpi_scorecards, "campaigns": campaigns}


def _export(name: str, cols, rows, fmt: str, f: dict) -> Response:
    heads = [c[1] for c in cols]
    data = [["" if r.get(k) is None else r.get(k) for k, _ in cols] for r in rows]
    fn = f"{name}_{f['start']}_{f['end']}"
    if fmt == "csv":
        out = io.StringIO()
        csv.writer(out).writerows([heads, *data])
        return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{fn}.csv"'})
    if fmt == "xlsx":
        from openpyxl import Workbook
        from openpyxl.styles import Font
        wb = Workbook()
        ws = wb.active
        ws.title = name[:30]
        ws.append([REPORTS[name], f"{f['start']} to {f['end']}"])
        ws.append(heads)
        for c in ws[2]:
            c.font = Font(bold=True)
        for r in data:
            ws.append(r)
        buf = io.BytesIO()
        wb.save(buf)
        return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{fn}.xlsx"'})
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    buf = io.BytesIO()
    st = getSampleStyleSheet()
    tbl = Table([[h.replace("₹", "INR") for h in heads], *[[str(x).replace("₹", "INR") for x in r] for r in data]], repeatRows=1)
    tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#262262")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("FONTSIZE", (0, 0), (-1, -1), 7), ("GRID", (0, 0), (-1, -1), 0.25, colors.grey)]))
    SimpleDocTemplate(buf, pagesize=landscape(A4), title=REPORTS[name]).build(
        [Paragraph(f"TaskBoard — {REPORTS[name]}", st["Title"]), Paragraph(f"Period {f['start']} to {f['end']}", st["Normal"]), Spacer(1, 8), tbl])
    return Response(buf.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fn}.pdf"'})


@router.get("/reports")
async def report_list(user: dict = Depends(get_current_user)):
    return {"reports": [{"id": k, "name": v} for k, v in REPORTS.items()], "detail_scope": detail_scope(user)}


@router.get("/reports/{name}")
async def run_report(name: str, start: str, end: str, employee: Optional[str] = None, stage: Optional[str] = None, service: Optional[str] = None,
                     format: str = "json", user: dict = Depends(get_current_user)):
    if name not in FN:
        raise HTTPException(status_code=404, detail="Unknown report")
    try:
        date.fromisoformat(start)
        date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date range")
    if employee and employee != user["id"] and not detail_scope(user):
        raise HTTPException(status_code=403, detail="You can only filter reports by your own name")
    f = {"start": start, "end": end, "employee": employee or None, "stage": stage or None, "service": service or None}
    cols, rows = await FN[name](f, user)
    rows = [{k: v for k, v in r.items() if k != "_uid"} for r in rows]
    if format in ("csv", "xlsx", "pdf"):
        return _export(name, cols, rows, format, f)
    return {"name": name, "title": REPORTS[name], "columns": [{"key": k, "label": lab} for k, lab in cols], "rows": rows, "filters": f,
            "detail_scope": detail_scope(user)}
