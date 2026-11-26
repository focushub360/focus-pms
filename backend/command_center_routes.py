"""TaskBoard Command Center: Executive Revenue & KPI Dashboard + Engineering Projects in Hand."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user, has_permission, require_any_permission
from core import audit, db, now_iso
from kpi_routes import department_metrics
from metrics import (
    OPEN_STAGES,
    QUALIFIED_LEAD_STATUSES,
    STAGES,
    confirmed_date,
    excluded_user_ids,
    fy_months,
    in_range,
    pct,
    period_range,
)

router = APIRouter(prefix="/api")

PROJECT_STAGES = ("Design", "Execution", "Commissioning", "Completed", "On Hold")
EXEC_PERMS = ("MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "MIS_REPORT_VIEW")
PROJECT_WRITE_PERMS = (
    "MANAGEMENT_BOARD_VIEW",
    "HOD_VIEW",
    "SYSTEM_ADMIN",
    "SALES_OPPORTUNITY_MANAGE",
    "TARGETS_CONFIGURE",
)


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    client_name: str = Field(min_length=2, max_length=200)
    stage: str = "Design"
    contract_value_inr: float = Field(default=0, ge=0)
    invoiced_inr: float = Field(default=0, ge=0)
    collected_inr: float = Field(default=0, ge=0)
    progress_pct: float = Field(default=0, ge=0, le=100)
    project_manager_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    account_id: Optional[str] = None
    start_date: Optional[str] = None
    expected_end_date: Optional[str] = None
    notes: str = ""


class ProjectUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    client_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    stage: Optional[str] = None
    contract_value_inr: Optional[float] = Field(default=None, ge=0)
    invoiced_inr: Optional[float] = Field(default=None, ge=0)
    collected_inr: Optional[float] = Field(default=None, ge=0)
    progress_pct: Optional[float] = Field(default=None, ge=0, le=100)
    project_manager_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    account_id: Optional[str] = None
    start_date: Optional[str] = None
    expected_end_date: Optional[str] = None
    notes: Optional[str] = None


def _validate_project_stage(stage: str) -> None:
    if stage not in PROJECT_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid project stage. Allowed: {', '.join(PROJECT_STAGES)}")


@router.get("/projects")
async def list_projects(
    stage: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    if stage:
        _validate_project_stage(stage)
    flt: dict = {}
    if stage:
        flt["stage"] = stage
    if (
        not user.get("is_super_admin")
        and not any(has_permission(user, p) for p in EXEC_PERMS)
        and user.get("data_visibility") == "OWN"
    ):
        flt["$or"] = [{"project_manager_id": user["id"]}, {"created_by": user["id"]}]
    return [p async for p in db.projects.find(flt, {"_id": 0}).sort("created_at", -1)]


@router.post("/projects")
async def create_project(
    payload: ProjectIn,
    user: dict = Depends(require_any_permission(*PROJECT_WRITE_PERMS)),
):
    _validate_project_stage(payload.stage)
    count = await db.projects.count_documents({}) + 1
    doc = {
        "id": str(uuid.uuid4()),
        "project_code": f"PRJ-{count:04d}",
        **payload.model_dump(),
        "project_manager_id": payload.project_manager_id or user["id"],
        "created_by": user["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    await audit(
        user,
        "PROJECT_CREATED",
        "project",
        doc["id"],
        {"name": doc["name"], "stage": doc["stage"], "contract_value_inr": doc["contract_value_inr"]},
    )
    return doc


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdateIn,
    user: dict = Depends(require_any_permission(*PROJECT_WRITE_PERMS)),
):
    old = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Project not found")
    if (
        not user.get("is_super_admin")
        and not any(has_permission(user, p) for p in EXEC_PERMS)
        and user.get("data_visibility") == "OWN"
        and old.get("project_manager_id") != user["id"]
        and old.get("created_by") != user["id"]
    ):
        raise HTTPException(status_code=403, detail="Not authorised to modify this project")

    updates = payload.model_dump(exclude_unset=True)
    if "stage" in updates and updates["stage"] is not None:
        _validate_project_stage(updates["stage"])
        if updates["stage"] == "Completed" and "progress_pct" not in updates:
            updates["progress_pct"] = 100
    if not updates:
        return old

    updates["updated_at"] = now_iso()
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    prev = {k: old.get(k) for k in updates if k != "updated_at" and old.get(k) != updates[k]}
    if prev:
        act = "PROJECT_STAGE_CHANGED" if "stage" in prev else "PROJECT_UPDATED"
        await audit(
            user,
            act,
            "project",
            project_id,
            {"name": updates.get("name") or old["name"]},
            previous=prev,
            new={k: updates[k] for k in prev},
        )
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    user: dict = Depends(require_any_permission("MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN")),
):
    old = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not old:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.projects.delete_one({"id": project_id})
    await audit(user, "PROJECT_DELETED", "project", project_id, {"name": old.get("name")}, previous=old)
    return {"ok": True}


def _prev_period(fy_code: str, month: Optional[str], quarter: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    months = fy_months(fy_code)
    if month and month in months:
        idx = months.index(month)
        if idx > 0:
            return period_range(fy_code, month=months[idx - 1])
        return None, None
    if quarter in ("Q2", "Q3", "Q4"):
        prev_q = f"Q{int(quarter[1]) - 1}"
        return period_range(fy_code, quarter=prev_q)
    return None, None


@router.get("/command-center/executive")
async def executive_command_center(
    fy_code: str = "FY2026-27",
    month: Optional[str] = None,
    quarter: Optional[str] = None,
    employee_id: Optional[str] = None,
    user: dict = Depends(require_any_permission(*EXEC_PERMS)),
):
    """Unified real-time executive revenue, 3D funnel, projects in hand, pipeline & analytics."""
    s, e = period_range(fy_code, month, quarter)
    fs, fe = period_range(fy_code)
    months = fy_months(fy_code)
    now_dt = datetime.now(timezone.utc)
    now_str = now_dt.isoformat()
    today_str = now_dt.date().isoformat()

    dept = await department_metrics(fy_code, s, e, employee_id)
    excl = await excluded_user_ids(db)

    all_opps = [o async for o in db.opportunities.find({}, {"_id": 0})]
    all_opps = [o for o in all_opps if o.get("primary_owner_id") not in excl]
    if employee_id:
        all_opps = [
            o for o in all_opps
            if o.get("primary_owner_id") == employee_id or employee_id in (o.get("contributor_ids") or [])
        ]

    # Period-matched leads
    lead_flt: dict = {"is_duplicate": {"$ne": True}}
    if employee_id:
        lead_flt["owner_id"] = employee_id
    all_leads = [l async for l in db.leads.find(lead_flt, {"_id": 0}) if l.get("owner_id") not in excl]
    period_leads = [l for l in all_leads if in_range(l.get("created_at"), s, e)]

    # Temperature breakdown (Hot, Warm, Cold) — default Warm if unset
    temp_map = {"Hot": {"count": 0, "value_inr": 0.0}, "Warm": {"count": 0, "value_inr": 0.0}, "Cold": {"count": 0, "value_inr": 0.0}}
    for l in period_leads:
        t = l.get("temperature") if l.get("temperature") in temp_map else "Warm"
        temp_map[t]["count"] += 1
        temp_map[t]["value_inr"] += float(l.get("estimated_value_inr") or 0)

    # Activities (meetings + follow-ups)
    act_flt: dict = {"is_deleted": {"$ne": True}}
    if employee_id:
        act_flt["assigned_to"] = employee_id
    all_acts = [a async for a in db.activities.find(act_flt, {"_id": 0}) if a.get("assigned_to") not in excl]
    meetings_period = [
        a for a in all_acts
        if a.get("activity_type") in ("Customer Meeting", "Meeting")
        and in_range(a.get("start_at"), s, e)
        and a.get("status") != "Cancelled"
    ]
    upcoming_meetings = sorted(
        [
            a for a in all_acts
            if a.get("activity_type") in ("Customer Meeting", "Meeting", "Internal Meeting")
            and a.get("status") not in ("Completed", "Cancelled")
            and (a.get("start_at") or "")[:10] >= today_str
        ],
        key=lambda x: x.get("start_at") or "",
    )[:12]
    pending_followups = sorted(
        [
            a for a in all_acts
            if a.get("activity_type") == "Follow-up"
            and a.get("status") not in ("Completed", "Cancelled")
        ],
        key=lambda x: x.get("start_at") or "",
    )[:12]

    # Converted deals (opportunities in qualified+ stages or created from leads in period)
    qualified_opps = [
        o for o in all_opps
        if o.get("stage") not in ("New", "Contacted", "Lost", "On Hold")
        and in_range(o.get("created_at"), s, e)
    ]
    if not qualified_opps:
        # Include active open qualified pipeline when filtered period has older created_at deals
        qualified_opps = [o for o in all_opps if o.get("stage") in ("Qualified", "Meeting / Discovery", "Solution Development", "Proposal Submitted", "Negotiation", "Won")]

    won_period = [
        o for o in all_opps
        if o.get("stage") == "Won" and in_range(confirmed_date(o), s, e)
    ]
    won_value_total = round(sum(float(o.get("value_inr") or 0) for o in won_period), 2)

    # Projects in Hand (Design, Execution, Commissioning, Completed, On Hold)
    proj_flt: dict = {}
    if employee_id:
        proj_flt["project_manager_id"] = employee_id
    projects = [p async for p in db.projects.find(proj_flt, {"_id": 0}).sort("created_at", -1)]
    proj_stages = {}
    for st in PROJECT_STAGES:
        st_rows = [p for p in projects if p.get("stage") == st]
        proj_stages[st] = {
            "stage": st,
            "count": len(st_rows),
            "contract_value_inr": round(sum(float(p.get("contract_value_inr") or 0) for p in st_rows), 2),
            "invoiced_inr": round(sum(float(p.get("invoiced_inr") or 0) for p in st_rows), 2),
            "collected_inr": round(sum(float(p.get("collected_inr") or 0) for p in st_rows), 2),
            "avg_progress_pct": round(sum(float(p.get("progress_pct") or 0) for p in st_rows) / len(st_rows), 1) if st_rows else 0.0,
        }

    # Finance integration: combine Won Opportunities + Active/Completed Projects (without double-counting linked opportunities)
    linked_opp_ids = {p.get("opportunity_id") for p in projects if p.get("opportunity_id")}
    unlinked_won = [o for o in won_period if o.get("id") not in linked_opp_ids]
    invoiced_total = round(
        sum(float(p.get("invoiced_inr") or 0) for p in projects)
        + sum(float(o.get("invoiced_inr") or 0) for o in unlinked_won),
        2,
    )
    collected_total = round(
        sum(float(p.get("collected_inr") or 0) for p in projects)
        + sum(float(o.get("collected_inr") or 0) for o in unlinked_won),
        2,
    )
    outstanding_total = round(max(invoiced_total - collected_total, 0.0), 2)

    # Targets & Growth comparison
    dept_target_doc = await db.targets.find_one({"user_id": "DEPARTMENT", "fy_code": fy_code}, {"_id": 0}) or {}
    dept_monthly_targets = dept_target_doc.get("monthly_targets") or {}
    annual_target = dept.get("department_target_inr") or 0.0
    if month and month in months:
        period_target = float(dept_monthly_targets.get(month) or (annual_target / 12.0 if annual_target else 0.0))
    elif quarter in ("Q1", "Q2", "Q3", "Q4"):
        q_idx = int(quarter[1]) - 1
        qm = months[q_idx * 3:(q_idx + 1) * 3]
        q_sum = sum(float(dept_monthly_targets.get(m) or 0) for m in qm)
        period_target = q_sum or (annual_target / 4.0 if annual_target else 0.0)
    else:
        period_target = annual_target

    # Previous period growth %
    ps, pe = _prev_period(fy_code, month, quarter)
    growth_pct = None
    if ps and pe:
        prev_won = sum(
            float(o.get("value_inr") or 0)
            for o in all_opps
            if o.get("stage") == "Won" and in_range(confirmed_date(o), ps, pe)
        )
        if prev_won > 0:
            growth_pct = round((won_value_total - prev_won) / prev_won * 100.0, 2)
    else:
        # Full FY: compare latest active month vs previous month
        cur_m = datetime.now(timezone.utc).strftime("%Y-%m")
        if cur_m in months and months.index(cur_m) > 0:
            idx = months.index(cur_m)
            cm_val = sum(float(o.get("value_inr") or 0) for o in all_opps if o.get("stage") == "Won" and (confirmed_date(o) or "")[:7] == months[idx])
            pm_val = sum(float(o.get("value_inr") or 0) for o in all_opps if o.get("stage") == "Won" and (confirmed_date(o) or "")[:7] == months[idx - 1])
            if pm_val > 0:
                growth_pct = round((cm_val - pm_val) / pm_val * 100.0, 2)

    # Monthly & Quarterly Revenue Analytics
    monthly_map = {
        m: {
            "month": m,
            "target_inr": round(float(dept_monthly_targets.get(m) or (annual_target / 12.0 if annual_target else 0.0)), 2),
            "won_inr": 0.0,
            "invoiced_inr": 0.0,
            "collected_inr": 0.0,
        }
        for m in months
    }
    for o in all_opps:
        if o.get("stage") == "Won":
            cm = (confirmed_date(o) or "")[:7]
            if cm in monthly_map:
                monthly_map[cm]["won_inr"] += float(o.get("value_inr") or 0)
                if o.get("id") not in linked_opp_ids:
                    monthly_map[cm]["invoiced_inr"] += float(o.get("invoiced_inr") or 0)
                    monthly_map[cm]["collected_inr"] += float(o.get("collected_inr") or 0)
    for p in projects:
        pm = (p.get("start_date") or p.get("created_at") or "")[:7]
        if pm in monthly_map:
            monthly_map[pm]["invoiced_inr"] += float(p.get("invoiced_inr") or 0)
            monthly_map[pm]["collected_inr"] += float(p.get("collected_inr") or 0)

    monthly_revenue = [
        {k: round(v, 2) if isinstance(v, float) else v for k, v in row.items()}
        for row in monthly_map.values()
    ]
    quarterly_revenue = []
    for qi in range(4):
        q_slice = monthly_revenue[qi * 3:(qi + 1) * 3]
        quarterly_revenue.append({
            "quarter": f"Q{qi + 1}",
            "target_inr": round(sum(x["target_inr"] for x in q_slice), 2),
            "won_inr": round(sum(x["won_inr"] for x in q_slice), 2),
            "invoiced_inr": round(sum(x["invoiced_inr"] for x in q_slice), 2),
            "collected_inr": round(sum(x["collected_inr"] for x in q_slice), 2),
        })

    # Monthly scorecard health for team leaderboard
    active_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    if active_month not in months:
        active_month = months[0]
    sheets = {
        sh["user_id"]: sh
        async for sh in db.monthly_kpi_sheets.find({"month": active_month}, {"_id": 0})
    }
    legacy_sc = {
        sc["user_id"]: sc
        async for sc in db.monthly_scorecards.find({"month": active_month}, {"_id": 0})
    }

    users_by_id = {u["id"]: u["name"] async for u in db.users.find({}, {"_id": 0, "id": 1, "name": 1})}
    team_performance = []
    for r in dept["rows"]:
        uid = r["user_id"]
        sh = sheets.get(uid) or legacy_sc.get(uid)
        team_performance.append({
            "user_id": uid,
            "name": r["name"],
            "designation": r.get("designation"),
            "functional_responsibility": r.get("functional_responsibility"),
            "target_inr": r.get("target_inr") or 0,
            "won_inr": r.get("confirmed_won_inr") or 0,
            "achievement_pct": r.get("achievement_pct"),
            "pipeline_inr": r.get("pipeline_inr") or 0,
            "leads_qualified": r.get("leads_qualified") or 0,
            "meetings_completed": r.get("meetings_completed") or 0,
            "win_rate_pct": r.get("win_rate_pct"),
            "kpi_score": sh.get("overall_score") if sh else None,
            "kpi_status": sh.get("status") if sh else "NOT_STARTED",
        })
    team_performance.sort(key=lambda x: x["won_inr"], reverse=True)

    # Pipeline tracking lists
    potential_sales = sorted(
        [
            {
                "id": o["id"],
                "title": o["title"],
                "account_name": o.get("account_name"),
                "stage": o.get("stage"),
                "value_inr": float(o.get("value_inr") or 0),
                "probability": float(o.get("probability") or 0),
                "expected_close_date": o.get("expected_close_date"),
                "owner_name": users_by_id.get(o.get("primary_owner_id"), "—"),
            }
            for o in all_opps
            if o.get("stage") in OPEN_STAGES
        ],
        key=lambda x: x["value_inr"],
        reverse=True,
    )[:15]

    prospects = sorted(
        [
            {
                "id": l["id"],
                "lead_code": l.get("lead_code"),
                "name": l.get("name"),
                "company": l.get("company"),
                "status": l.get("status"),
                "temperature": l.get("temperature") if l.get("temperature") in temp_map else "Warm",
                "estimated_value_inr": float(l.get("estimated_value_inr") or 0),
                "source": l.get("source"),
                "owner_name": users_by_id.get(l.get("owner_id"), "—"),
            }
            for l in all_leads
            if l.get("status") not in ("Converted", "Disqualified")
        ],
        key=lambda x: ({"Hot": 0, "Warm": 1, "Cold": 2}.get(x["temperature"], 1), -x["estimated_value_inr"]),
    )[:15]

    leads_total_count = len(period_leads)
    meetings_total_count = len(meetings_period)
    converted_count = len(qualified_opps)
    won_count = len(won_period)

    return {
        "period": {"fy_code": fy_code, "start": s, "end": e, "month": month, "quarter": quarter, "active_kpi_month": active_month},
        "revenue_overview": {
            "total_revenue_inr": round(dept["confirmed_won_inr"], 2),
            "annual_target_inr": round(annual_target, 2) if annual_target else None,
            "period_target_inr": round(period_target, 2) if period_target else None,
            "achievement_pct": pct(dept["confirmed_won_inr"], period_target) if period_target else dept.get("achievement_pct"),
            "growth_pct": growth_pct,
            "active_pipeline_inr": round(dept["pipeline_inr"], 2),
            "weighted_pipeline_inr": round(dept["weighted_pipeline_inr"], 2),
            "win_rate_pct": dept.get("win_rate_pct"),
            "avg_deal_size_inr": round(won_value_total / won_count, 2) if won_count else 0.0,
            "won_count": dept["won_count"],
            "lost_count": dept["lost_count"],
            "invoiced_inr": invoiced_total,
            "collected_inr": collected_total,
            "outstanding_inr": outstanding_total,
            "collection_rate_pct": pct(collected_total, invoiced_total),
        },
        "sales_funnel": {
            "hot_leads": {**temp_map["Hot"], "value_inr": round(temp_map["Hot"]["value_inr"], 2)},
            "warm_leads": {**temp_map["Warm"], "value_inr": round(temp_map["Warm"]["value_inr"], 2)},
            "cold_leads": {**temp_map["Cold"], "value_inr": round(temp_map["Cold"]["value_inr"], 2)},
            "total_leads": {
                "count": leads_total_count,
                "value_inr": round(sum(x["value_inr"] for x in temp_map.values()), 2),
            },
            "meetings": {"count": meetings_total_count},
            "converted_deals": {
                "count": converted_count,
                "value_inr": round(sum(float(o.get("value_inr") or 0) for o in qualified_opps), 2),
            },
            "revenue_won": {
                "count": won_count,
                "value_inr": won_value_total,
            },
            "conversion_rates": {
                "lead_to_meeting_pct": pct(meetings_total_count, leads_total_count),
                "meeting_to_deal_pct": pct(converted_count, meetings_total_count),
                "deal_to_won_pct": pct(won_count, converted_count),
                "overall_lead_to_won_pct": pct(won_count, leads_total_count),
            },
        },
        "projects_in_hand": {
            "stages": [proj_stages[st] for st in PROJECT_STAGES],
            "total_projects": len(projects),
            "active_projects": sum(proj_stages[st]["count"] for st in ("Design", "Execution", "Commissioning")),
            "total_contract_value_inr": round(sum(float(p.get("contract_value_inr") or 0) for p in projects), 2),
            "total_invoiced_inr": round(sum(float(p.get("invoiced_inr") or 0) for p in projects), 2),
            "total_collected_inr": round(sum(float(p.get("collected_inr") or 0) for p in projects), 2),
            "items": [
                {**p, "project_manager_name": users_by_id.get(p.get("project_manager_id"), "—")}
                for p in projects[:25]
            ],
        },
        "pipeline_tracking": {
            "potential_sales": potential_sales,
            "followups": [
                {**a, "owner_name": users_by_id.get(a.get("assigned_to"), "—")}
                for a in pending_followups
            ],
            "upcoming_meetings": [
                {**a, "owner_name": users_by_id.get(a.get("assigned_to"), "—")}
                for a in upcoming_meetings
            ],
            "prospects": prospects,
        },
        "analytics": {
            "monthly_revenue": monthly_revenue,
            "quarterly_revenue": quarterly_revenue,
            "team_performance": team_performance,
            "kpi_summary": {
                "submitted": sum(1 for sh in sheets.values() if sh.get("status") == "SUBMITTED"),
                "approved": sum(1 for sh in sheets.values() if sh.get("status") == "APPROVED"),
                "returned": sum(1 for sh in sheets.values() if sh.get("status") == "RETURNED"),
                "draft": sum(1 for sh in sheets.values() if sh.get("status") == "DRAFT"),
            },
        },
        "employees": [{"id": r["user_id"], "name": r["name"]} for r in dept["rows"]],
        "stages": STAGES,
        "project_stages": list(PROJECT_STAGES),
        "generated_at": now_str,
    }
