"""Employee Monthly KPI Scorecard: role-specific templates, weekly progress log,
monthly actuals, Active/Deactive management, configurable cap, and HOD approval workflow."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from alerts_routes import notify
from auth import get_current_user, has_permission, require_any_permission
from core import audit, db, now_iso
from kpi_catalog import MONTHLY_ROLE_TEMPLATES, SYSTEM_KPI_MAP, template_code_for_user
from kpi_routes import ensure_view, get_thresholds
from metrics import excluded_user_ids, pct, period_range, user_metrics
from phase2_routes import resolve_approver

router = APIRouter(prefix="/api")

HOD_CONFIG_PERMS = ("TARGETS_CONFIGURE", "HOD_VIEW", "SYSTEM_ADMIN")
HOD_VIEW_PERMS = ("TARGETS_CONFIGURE", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW", "SYSTEM_ADMIN")


def _fy_of(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    start = y if m >= 4 else y - 1
    return f"FY{start}-{str(start + 1)[2:]}"


def monthly_kpi_status(ach_pct: Optional[float], actual, target, is_active: bool, th: dict) -> str:
    if not is_active:
        return "Deactive"
    if actual is None or target in (None, 0) or ach_pct is None:
        return "Pending"
    on_track_th = float(th.get("achieved", 100))
    watch_th = float(th.get("on_track", 80))
    if ach_pct >= on_track_th:
        return "On Track"
    if ach_pct >= watch_th:
        return "Watch"
    return "At Risk"


def recompute_monthly_sheet(sheet: dict, th: dict) -> dict:
    """Recalculate achievement %, capped weighted score, status, and summary totals.
    Deactivated KPIs remain visible with preserved values but are excluded from all totals."""
    cap_pct = float(th.get("achievement_cap", 120.0))
    active_weight_total = 0.0
    total_weighted_score = 0.0
    on_track_count = 0
    watch_count = 0
    at_risk_count = 0
    pending_count = 0
    updated_kpis = []

    for item in sheet.get("kpis") or []:
        k = dict(item)
        is_active = bool(k.get("is_active", True))

        # Monthly actual is explicitly entered/synced for the month (never summed from weekly percentages)
        actual = k.get("actual")
        if actual is not None:
            actual = float(actual)
        elif k.get("data_source") == "SYSTEM" and k.get("crm_actual") is not None:
            actual = float(k["crm_actual"])

        target = float(k["target"]) if k.get("target") is not None else None
        weight = float(k.get("weight") or 0)

        if actual is None or target in (None, 0):
            raw_ach = None
        elif k.get("direction") == "lower":
            raw_ach = round(target / actual * 100.0, 2) if actual > 0 else 100.0
        else:
            raw_ach = pct(actual, target)

        capped_ach = round(min(raw_ach, cap_pct), 2) if raw_ach is not None else None
        max_ws = round(weight * (cap_pct / 100.0), 2)
        ws = round((capped_ach / 100.0) * weight, 2) if (capped_ach is not None and is_active and weight > 0) else (0.0 if is_active else None)

        st = monthly_kpi_status(raw_ach, actual, target, is_active, th)

        k["actual"] = actual
        k["achievement_pct"] = raw_ach
        k["capped_achievement_pct"] = capped_ach
        k["max_weighted_score"] = max_ws
        k["weighted_score"] = ws
        k["status"] = st

        if is_active:
            active_weight_total += weight
            if ws is not None:
                total_weighted_score += ws
            if st == "On Track":
                on_track_count += 1
            elif st == "Watch":
                watch_count += 1
            elif st == "At Risk":
                at_risk_count += 1
            else:
                pending_count += 1

        updated_kpis.append(k)

    sheet["kpis"] = updated_kpis
    sheet["achievement_cap_pct"] = cap_pct
    sheet["active_weight_total"] = round(active_weight_total, 2)
    sheet["remaining_weight"] = round(100.0 - active_weight_total, 2)
    sheet["total_weighted_score"] = round(total_weighted_score, 2)
    sheet["overall_score"] = (
        round(min(total_weighted_score / active_weight_total * 100.0, cap_pct), 2)
        if active_weight_total > 0
        else 0.0
    )
    sheet["summary"] = {
        "on_track": on_track_count,
        "watch": watch_count,
        "at_risk": at_risk_count,
        "pending": pending_count,
        "active_count": sum(1 for x in updated_kpis if x.get("is_active")),
        "deactive_count": sum(1 for x in updated_kpis if not x.get("is_active")),
    }
    return sheet


async def _crm_values_for_month(uid: str, month: str) -> dict:
    fy = _fy_of(month)
    s, e = period_range(fy, month=month)
    m = await user_metrics(db, uid, fy, s, e)
    m = {**m, "lost_doc_pct": pct(m["lost_with_reason"], m["lost_count"]), "l2o_pct": pct(m["opp_created"], m["leads_total"])}
    return m


async def _build_default_sheet(target_user: dict, month: str, template_code: Optional[str] = None) -> dict:
    fy = _fy_of(month)
    t_code = template_code if template_code in MONTHLY_ROLE_TEMPLATES else template_code_for_user(target_user)
    tpl = MONTHLY_ROLE_TEMPLATES[t_code]

    tgt_doc = await db.targets.find_one({"user_id": target_user["id"], "fy_code": fy}, {"_id": 0}) or {}
    monthly_sales_tgt = (tgt_doc.get("monthly_targets") or {}).get(month)
    if not monthly_sales_tgt and tgt_doc.get("sales_target_inr"):
        monthly_sales_tgt = round(float(tgt_doc["sales_target_inr"]) / 12.0, 2)

    assigns = {
        a["kpi_code"]: a
        async for a in db.kpi_assignments.find({"user_id": target_user["id"], "fy_code": fy}, {"_id": 0})
    }
    crm = await _crm_values_for_month(target_user["id"], month)
    approver = await resolve_approver(target_user["id"])

    kpis = []
    for item in tpl["items"]:
        code = item["kpi_code"]
        a = assigns.get(code) or {}
        target_val = item["default_target"]
        if code == "SP_CONF_SALES" and monthly_sales_tgt:
            target_val = monthly_sales_tgt
        elif a.get("target_value") is not None:
            if a.get("frequency") == "ANNUAL" and item["unit"] in ("INR", "count"):
                target_val = round(float(a["target_value"]) / 12.0, 2)
            else:
                target_val = float(a["target_value"])

        crm_actual = None
        if item["data_source"] == "SYSTEM":
            sys_key = SYSTEM_KPI_MAP.get(code)
            if sys_key and not sys_key.startswith(("src:", "dept:")):
                crm_actual = crm.get(sys_key)

        kpis.append({
            "kpi_code": code,
            "kpi_name": item["kpi_name"],
            "measurement": item.get("measurement", ""),
            "unit": item["unit"],
            "frequency": item.get("frequency", "Monthly"),
            "source": item.get("source", "Manual"),
            "direction": item["direction"],
            "kpi_group": item.get("kpi_group", "Functional"),
            "data_source": item["data_source"],
            "is_optional": bool(item.get("is_optional")),
            "is_project_kpi": bool(item.get("is_project_kpi")),
            "is_active": bool(item.get("is_active", True)),
            "weight": float(item["weight"]),
            "target": float(target_val),
            "crm_actual": crm_actual,
            "actual": crm_actual if (item["data_source"] == "SYSTEM" and crm_actual is not None) else None,
            "achievement_pct": None,
            "capped_achievement_pct": None,
            "weighted_score": None,
            "max_weighted_score": round(float(item["weight"]) * 1.2, 2),
            "status": "Pending" if item.get("is_active", True) else "Deactive",
            "remarks": "",
            "updated_at": now_iso(),
        })

    sheet = {
        "id": str(uuid.uuid4()),
        "user_id": target_user["id"],
        "user_name": target_user["name"],
        "designation": target_user.get("designation") or "Team Member",
        "department": target_user.get("department") or "Sales & Marketing",
        "month": month,
        "fy_code": fy,
        "template_code": t_code,
        "template_label": tpl["label"],
        "status": "DRAFT",
        "locked": False,
        "approver_id": approver["id"] if approver else None,
        "approver_name": approver["name"] if approver else None,
        "decision_comment": "",
        "kpis": kpis,
        "weekly_notes": {"w1": "", "w2": "", "w3": "", "w4": "", "w5": ""},
        "history": [],
        "submitted_at": None,
        "decided_at": None,
        "decided_by": None,
        "decided_by_name": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    th = await get_thresholds()
    return recompute_monthly_sheet(sheet, th)


@router.get("/monthly-kpis/templates")
async def get_monthly_templates(user: dict = Depends(get_current_user)):
    return list(MONTHLY_ROLE_TEMPLATES.values())


@router.get("/monthly-kpis/queue")
async def monthly_kpi_queue(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt: dict = {"status": "SUBMITTED"}
    if month:
        flt["month"] = month
    if not (user.get("is_super_admin") or any(has_permission(user, p) for p in ("HOD_VIEW", "MANAGEMENT_BOARD_VIEW"))):
        flt["approver_id"] = user["id"]
    return [s async for s in db.monthly_kpi_sheets.find(flt, {"_id": 0}).sort("submitted_at", 1)]


@router.get("/monthly-kpis/team-summary")
async def monthly_kpi_team_summary(
    month: str,
    user: dict = Depends(require_any_permission(*HOD_VIEW_PERMS)),
):
    excl = await excluded_user_ids(db)
    users = [
        u async for u in db.users.find({"is_sales_contributor": True, "is_active": True}, {"_id": 0, "password_hash": 0})
        if u["id"] not in excl
    ]
    sheets = {s["user_id"]: s async for s in db.monthly_kpi_sheets.find({"month": month}, {"_id": 0})}
    rows = []
    for u in users:
        sh = sheets.get(u["id"])
        rows.append({
            "user_id": u["id"],
            "name": u["name"],
            "designation": u.get("designation"),
            "department": u.get("department"),
            "template_code": sh["template_code"] if sh else template_code_for_user(u),
            "status": sh["status"] if sh else "NOT_STARTED",
            "locked": bool(sh.get("locked")) if sh else False,
            "overall_score": sh.get("overall_score") if sh else None,
            "total_weighted_score": sh.get("total_weighted_score") if sh else None,
            "active_weight_total": sh.get("active_weight_total") if sh else None,
            "submitted_at": sh.get("submitted_at") if sh else None,
            "sheet_id": sh.get("id") if sh else None,
        })
    return {"month": month, "rows": rows}


@router.get("/monthly-kpis")
async def get_monthly_kpi_sheet(
    month: str,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user_id or user["id"]
    ensure_view(user, uid)
    target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Employee not found")

    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": month}, {"_id": 0})
    if not sheet:
        sheet = await _build_default_sheet(target_user, month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))
    else:
        th = await get_thresholds()
        if not sheet.get("locked") and sheet.get("status") in ("DRAFT", "RETURNED"):
            sheet = recompute_monthly_sheet(sheet, th)
    return sheet


# ───────────────────────── SEPARATE WEEKLY PROGRESS LOGS ─────────────────────────
class WeeklyLogIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    kpi_code: str
    update_date: Optional[str] = None
    week_label: str = "Week 1"
    progress_value: float = Field(ge=0)
    remarks: str = ""


@router.get("/monthly-kpis/weekly-logs")
async def list_weekly_logs(
    month: str,
    user_id: Optional[str] = None,
    kpi_code: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    uid = user_id or user["id"]
    ensure_view(user, uid)
    flt: dict = {"user_id": uid, "month": month}
    if kpi_code:
        flt["kpi_code"] = kpi_code
    return [x async for x in db.weekly_kpi_updates.find(flt, {"_id": 0}).sort("created_at", -1)]


@router.post("/monthly-kpis/weekly-log")
async def create_weekly_log(
    payload: WeeklyLogIn,
    user: dict = Depends(get_current_user),
):
    uid = payload.user_id or user["id"]
    if uid != user["id"] and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only the employee can log their own weekly KPI progress")
    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="Employee not found")
        sheet = await _build_default_sheet(target_user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is {sheet['status'].lower()} and locked")

    kpi_row = next((k for k in sheet["kpis"] if k["kpi_code"] == payload.kpi_code), None)
    if not kpi_row:
        raise HTTPException(status_code=404, detail="KPI not found in monthly scorecard")
    if not kpi_row.get("is_active", True):
        raise HTTPException(status_code=400, detail="Cannot log progress on a deactivated KPI; activate it first")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "user_name": sheet["user_name"],
        "month": payload.month,
        "fy_code": _fy_of(payload.month),
        "kpi_code": payload.kpi_code,
        "kpi_name": kpi_row["kpi_name"],
        "update_date": payload.update_date or now_iso()[:10],
        "week_label": payload.week_label,
        "progress_value": float(payload.progress_value),
        "unit": kpi_row["unit"],
        "remarks": payload.remarks,
        "updated_by": user["id"],
        "updated_by_name": user["name"],
        "created_at": now_iso(),
    }
    await db.weekly_kpi_updates.insert_one(doc)
    doc.pop("_id", None)
    await audit(
        user,
        "WEEKLY_KPI_PROGRESS_LOGGED",
        "weekly_kpi_update",
        doc["id"],
        {"user_id": uid, "month": payload.month, "kpi_code": payload.kpi_code, "week": payload.week_label},
        new={"progress_value": doc["progress_value"], "remarks": payload.remarks},
    )
    return doc


# ───────────────────────── MONTHLY ACTUALS & CONFIG ─────────────────────────
class MonthlyActualItem(BaseModel):
    kpi_code: str
    actual: Optional[float] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class MonthlyActualsIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    entries: list[MonthlyActualItem]


@router.put("/monthly-kpis/actuals")
async def update_monthly_actuals(
    payload: MonthlyActualsIn,
    user: dict = Depends(get_current_user),
):
    uid = payload.user_id or user["id"]
    if uid != user["id"] and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only the employee can enter their own monthly KPI actuals")
    if uid == user["id"] and not has_permission(user, "KPI_ACTUAL_SELF_UPDATE") and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Missing permission to update KPI actuals")

    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="Employee not found")
        sheet = await _build_default_sheet(target_user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is {sheet['status'].lower()} and locked from editing")

    by_code = {e.kpi_code: e for e in payload.entries}
    prev_vals = {}
    new_vals = {}
    for k in sheet["kpis"]:
        upd = by_code.get(k["kpi_code"])
        if upd:
            if not k.get("is_active", True):
                continue
            if upd.actual is not None and upd.actual < 0:
                raise HTTPException(status_code=400, detail=f"Negative actual value is not allowed for {k['kpi_name']}")
            prev_vals[k["kpi_code"]] = k.get("actual")
            k["actual"] = upd.actual
            new_vals[k["kpi_code"]] = upd.actual
            if upd.remarks is not None:
                k["remarks"] = upd.remarks
            k["updated_at"] = now_iso()

    th = await get_thresholds()
    sheet = recompute_monthly_sheet(sheet, th)
    sheet["updated_at"] = now_iso()
    await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": sheet})
    await audit(
        user,
        "MONTHLY_KPI_ACTUAL_UPDATED",
        "monthly_kpi_sheet",
        sheet["id"],
        {"user_id": uid, "month": payload.month, "overall_score": sheet["overall_score"]},
        previous=prev_vals,
        new=new_vals,
    )
    return sheet


class WeeklyNotesIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    notes: dict[str, str] = Field(default_factory=dict)


@router.put("/monthly-kpis/weekly-notes")
async def update_weekly_notes(payload: WeeklyNotesIn, user: dict = Depends(get_current_user)):
    uid = payload.user_id or user["id"]
    if uid != user["id"] and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only the employee can update their own weekly progress notes")
    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="Employee not found")
        sheet = await _build_default_sheet(target_user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is {sheet['status'].lower()} and locked")

    clean = {wk: str(payload.notes.get(wk, "") or "") for wk in ("w1", "w2", "w3", "w4", "w5")}
    await db.monthly_kpi_sheets.update_one(
        {"id": sheet["id"]},
        {"$set": {"weekly_notes": clean, "updated_at": now_iso()}},
    )
    await audit(user, "WEEKLY_PROGRESS_NOTES_UPDATED", "monthly_kpi_sheet", sheet["id"], {"user_id": uid, "month": payload.month})
    return await db.monthly_kpi_sheets.find_one({"id": sheet["id"]}, {"_id": 0})


# Backward-compatible weekly endpoint from earlier integration
class WeeklyEntryItem(BaseModel):
    kpi_code: str
    w1: Optional[float] = Field(default=None, ge=0)
    w2: Optional[float] = Field(default=None, ge=0)
    w3: Optional[float] = Field(default=None, ge=0)
    w4: Optional[float] = Field(default=None, ge=0)
    w5: Optional[float] = Field(default=None, ge=0)
    note: Optional[str] = None


class WeeklyUpdateIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    entries: list[WeeklyEntryItem]


@router.put("/monthly-kpis/weekly")
async def update_weekly_progress_compat(payload: WeeklyUpdateIn, user: dict = Depends(get_current_user)):
    uid = payload.user_id or user["id"]
    if uid != user["id"] and not user.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Only the employee can update their own weekly KPI progress")
    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="Employee not found")
        sheet = await _build_default_sheet(target_user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is {sheet['status'].lower()} and locked from editing")

    by_code = {e.kpi_code: e for e in payload.entries}
    for k in sheet["kpis"]:
        upd = by_code.get(k["kpi_code"])
        if upd:
            vals = [float(v) for v in (upd.w1, upd.w2, upd.w3, upd.w4, upd.w5) if v is not None]
            if vals:
                k["actual"] = round(sum(vals) / len(vals), 2) if k.get("unit") in ("%", "days", "hours") else round(sum(vals), 2)
            if upd.note is not None:
                k["remarks"] = upd.note
            k["updated_at"] = now_iso()

    th = await get_thresholds()
    sheet = recompute_monthly_sheet(sheet, th)
    sheet["updated_at"] = now_iso()
    await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": sheet})
    await audit(user, "MONTHLY_KPI_WEEKLY_UPDATED", "monthly_kpi_sheet", sheet["id"], {"user_id": uid, "month": payload.month})
    return sheet


class KpiConfigItem(BaseModel):
    kpi_code: str
    is_active: Optional[bool] = None
    weight: Optional[float] = Field(default=None, ge=0, le=100)
    target: Optional[float] = Field(default=None, ge=0)


class ConfigUpdateIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    template_code: Optional[str] = None
    items: list[KpiConfigItem] = Field(default_factory=list)


@router.put("/monthly-kpis/config")
async def update_monthly_config(payload: ConfigUpdateIn, user: dict = Depends(get_current_user)):
    uid = payload.user_id or user["id"]
    is_manager = any(has_permission(user, p) for p in HOD_CONFIG_PERMS)
    if uid != user["id"] and not is_manager:
        raise HTTPException(status_code=403, detail="Not authorised to configure another employee's KPIs")

    target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Employee not found")

    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        sheet = await _build_default_sheet(target_user, payload.month, payload.template_code)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is {sheet['status'].lower()} and locked")

    if payload.template_code and payload.template_code != sheet.get("template_code"):
        if not is_manager:
            raise HTTPException(status_code=403, detail="Only HOD or Admin can change the KPI role template")
        if payload.template_code not in MONTHLY_ROLE_TEMPLATES:
            raise HTTPException(status_code=400, detail="Unknown role template")
        sheet = await _build_default_sheet(target_user, payload.month, payload.template_code)
        await db.monthly_kpi_sheets.replace_one({"id": sheet["id"]}, dict(sheet), upsert=True)
        await audit(user, "MONTHLY_KPI_TEMPLATE_CHANGED", "monthly_kpi_sheet", sheet["id"], {"user_id": uid, "month": payload.month, "template_code": payload.template_code})
        return sheet

    cfg_map = {i.kpi_code: i for i in payload.items}
    toggles = []
    prev_cfg = {}
    new_cfg = {}
    for k in sheet["kpis"]:
        cfg = cfg_map.get(k["kpi_code"])
        if not cfg:
            continue
        if cfg.is_active is not None and bool(k.get("is_active", True)) != bool(cfg.is_active):
            if not (k.get("is_optional") or k.get("is_project_kpi")) and not is_manager:
                raise HTTPException(
                    status_code=403,
                    detail="Only HOD or Admin can activate/deactivate core KPIs; employees can request a toggle",
                )
            prev_cfg[f"{k['kpi_code']}.is_active"] = bool(k.get("is_active", True))
            k["is_active"] = bool(cfg.is_active)
            new_cfg[f"{k['kpi_code']}.is_active"] = bool(cfg.is_active)
            toggles.append((k["kpi_code"], k["kpi_name"], bool(cfg.is_active)))
        if cfg.weight is not None or cfg.target is not None:
            if not is_manager:
                raise HTTPException(status_code=403, detail="Only HOD or Admin can modify KPI targets or weights")
            if uid == user["id"] and not user.get("is_super_admin"):
                raise HTTPException(status_code=403, detail="You cannot revise your own KPI targets or weights")
            if cfg.weight is not None and float(cfg.weight) != float(k.get("weight") or 0):
                prev_cfg[f"{k['kpi_code']}.weight"] = k.get("weight")
                k["weight"] = float(cfg.weight)
                new_cfg[f"{k['kpi_code']}.weight"] = float(cfg.weight)
            if cfg.target is not None and float(cfg.target) != float(k.get("target") or 0):
                prev_cfg[f"{k['kpi_code']}.target"] = k.get("target")
                k["target"] = float(cfg.target)
                new_cfg[f"{k['kpi_code']}.target"] = float(cfg.target)
        k["updated_at"] = now_iso()

    th = await get_thresholds()
    sheet = recompute_monthly_sheet(sheet, th)
    sheet["updated_at"] = now_iso()
    await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": sheet})

    for kcode, kname, state in toggles:
        act = "KPI_ACTIVATED" if state else "KPI_DEACTIVATED"
        await audit(
            user,
            act,
            "monthly_kpi_sheet",
            sheet["id"],
            {"user_id": uid, "month": payload.month, "kpi_code": kcode, "kpi_name": kname},
            previous={"is_active": not state},
            new={"is_active": state},
        )
    if new_cfg:
        await audit(
            user,
            "MONTHLY_KPI_CONFIG_UPDATED",
            "monthly_kpi_sheet",
            sheet["id"],
            {"user_id": uid, "month": payload.month},
            previous=prev_cfg,
            new=new_cfg,
        )
    return sheet


# ───────────────────────── KPI ACTIVATION / DEACTIVATION REQUESTS ─────────────────────────
class ToggleRequestIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    kpi_code: str
    desired_active: bool
    reason: str = Field(min_length=3)


class ToggleDecisionIn(BaseModel):
    approve: bool
    comment: str = ""


@router.get("/monthly-kpis/toggle-requests")
async def list_toggle_requests(month: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt: dict = {}
    if month:
        flt["month"] = month
    if not (user.get("is_super_admin") or any(has_permission(user, p) for p in HOD_CONFIG_PERMS)):
        flt["$or"] = [{"user_id": user["id"]}, {"approver_id": user["id"]}]
    return [x async for x in db.kpi_toggle_requests.find(flt, {"_id": 0}).sort("created_at", -1)]


@router.post("/monthly-kpis/toggle-request")
async def request_kpi_toggle(payload: ToggleRequestIn, user: dict = Depends(get_current_user)):
    sheet = await db.monthly_kpi_sheets.find_one({"user_id": user["id"], "month": payload.month}, {"_id": 0})
    if not sheet:
        sheet = await _build_default_sheet(user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))
    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail="Cannot request changes on a submitted or approved scorecard")

    k = next((x for x in sheet["kpis"] if x["kpi_code"] == payload.kpi_code), None)
    if not k:
        raise HTTPException(status_code=404, detail="KPI not found")

    ap = await resolve_approver(user["id"])
    req = {
        "id": str(uuid.uuid4()),
        "sheet_id": sheet["id"],
        "user_id": user["id"],
        "user_name": user["name"],
        "month": payload.month,
        "kpi_code": payload.kpi_code,
        "kpi_name": k["kpi_name"],
        "desired_active": payload.desired_active,
        "reason": payload.reason,
        "approver_id": ap["id"] if ap else None,
        "approver_name": ap["name"] if ap else None,
        "status": "PENDING",
        "created_at": now_iso(),
    }
    await db.kpi_toggle_requests.insert_one(req)
    req.pop("_id", None)
    await audit(user, "KPI_TOGGLE_REQUESTED", "kpi_toggle_request", req["id"], {"kpi_code": payload.kpi_code, "desired_active": payload.desired_active, "reason": payload.reason})
    if ap:
        verb = "activate" if payload.desired_active else "deactivate"
        await notify(
            ap,
            "KPI_TOGGLE_REQUEST",
            f"{user['name']} requested to {verb} '{k['kpi_name']}' ({payload.month})",
            "/app/targets?tab=scorecard",
            f"ktog:{req['id']}",
        )
    return req


@router.post("/monthly-kpis/toggle-requests/{req_id}/decide")
async def decide_toggle_request(req_id: str, payload: ToggleDecisionIn, user: dict = Depends(get_current_user)):
    req = await db.kpi_toggle_requests.find_one({"id": req_id}, {"_id": 0})
    if not req or req["status"] != "PENDING":
        raise HTTPException(status_code=404, detail="Pending toggle request not found")
    if req["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="Cannot decide on your own request")
    if req.get("approver_id") != user["id"] and not any(has_permission(user, p) for p in HOD_CONFIG_PERMS):
        raise HTTPException(status_code=403, detail="Only HOD or authorised administrator can decide")

    status = "APPROVED" if payload.approve else "REJECTED"
    await db.kpi_toggle_requests.update_one(
        {"id": req_id},
        {"$set": {"status": status, "decided_by": user["id"], "decided_by_name": user["name"], "decision_comment": payload.comment, "decided_at": now_iso()}},
    )

    if payload.approve:
        sheet = await db.monthly_kpi_sheets.find_one({"id": req["sheet_id"]}, {"_id": 0})
        if sheet and not sheet.get("locked"):
            for k in sheet["kpis"]:
                if k["kpi_code"] == req["kpi_code"]:
                    k["is_active"] = req["desired_active"]
                    k["updated_at"] = now_iso()
            th = await get_thresholds()
            sheet = recompute_monthly_sheet(sheet, th)
            sheet["updated_at"] = now_iso()
            await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": sheet})

    await audit(user, f"KPI_TOGGLE_{status}", "kpi_toggle_request", req_id, {"kpi_code": req["kpi_code"], "comment": payload.comment})
    emp = await db.users.find_one({"id": req["user_id"]}, {"_id": 0, "password_hash": 0})
    if emp:
        await notify(
            emp,
            f"KPI_TOGGLE_{status}",
            f"Your request to {'activate' if req['desired_active'] else 'deactivate'} '{req['kpi_name']}' was {status.lower()}",
            "/app/targets?tab=scorecard",
            f"ktog-dec:{req_id}",
        )
    return await db.kpi_toggle_requests.find_one({"id": req_id}, {"_id": 0})


class SyncIn(BaseModel):
    user_id: Optional[str] = None
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


@router.post("/monthly-kpis/sync-crm")
async def sync_crm_to_monthly_kpis(payload: SyncIn, user: dict = Depends(get_current_user)):
    uid = payload.user_id or user["id"]
    ensure_view(user, uid)
    sheet = await db.monthly_kpi_sheets.find_one({"user_id": uid, "month": payload.month}, {"_id": 0})
    if not sheet:
        target_user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
        if not target_user:
            raise HTTPException(status_code=404, detail="Employee not found")
        sheet = await _build_default_sheet(target_user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("locked") or sheet.get("status") in ("SUBMITTED", "APPROVED"):
        raise HTTPException(status_code=400, detail="Cannot sync a submitted or approved scorecard")

    crm = await _crm_values_for_month(uid, payload.month)
    for k in sheet["kpis"]:
        if k.get("data_source") == "SYSTEM":
            sys_key = SYSTEM_KPI_MAP.get(k["kpi_code"])
            if sys_key and not sys_key.startswith(("src:", "dept:")):
                k["crm_actual"] = crm.get(sys_key)
                k["actual"] = crm.get(sys_key)
                k["updated_at"] = now_iso()

    th = await get_thresholds()
    sheet = recompute_monthly_sheet(sheet, th)
    sheet["updated_at"] = now_iso()
    await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": sheet})
    return sheet


class SubmitMonthlyIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    comment: str = ""


@router.post("/monthly-kpis/submit")
async def submit_monthly_kpi_sheet(payload: SubmitMonthlyIn, user: dict = Depends(get_current_user)):
    if payload.month > datetime.now(timezone.utc).strftime("%Y-%m"):
        raise HTTPException(status_code=400, detail="You cannot submit a scorecard for a future month")

    sheet = await db.monthly_kpi_sheets.find_one({"user_id": user["id"], "month": payload.month}, {"_id": 0})
    if not sheet:
        sheet = await _build_default_sheet(user, payload.month)
        await db.monthly_kpi_sheets.insert_one(dict(sheet))

    if sheet.get("status") in ("SUBMITTED", "APPROVED") or sheet.get("locked"):
        raise HTTPException(status_code=400, detail=f"Scorecard for {payload.month} is already {sheet['status'].lower()}")

    th = await get_thresholds()
    sheet = recompute_monthly_sheet(sheet, th)

    # Section 8.3 Strict Submission Validation with field-specific errors
    errors = []
    if abs(sheet["active_weight_total"] - 100.0) > 0.01:
        diff = round(100.0 - sheet["active_weight_total"], 2)
        errors.append({
            "kpi_code": "_WEIGHT_TOTAL",
            "kpi_name": "Weight Allocation",
            "field": "weight",
            "message": f"Active KPI weights must total 100% (currently {sheet['active_weight_total']}%, {'remaining ' + str(diff) + '%' if diff > 0 else 'excess ' + str(abs(diff)) + '%'})",
        })
    for k in sheet["kpis"]:
        if not k.get("is_active"):
            continue
        if k.get("target") is None or float(k["target"]) <= 0:
            errors.append({"kpi_code": k["kpi_code"], "kpi_name": k["kpi_name"], "field": "target", "message": f"{k['kpi_name']}: target must be greater than 0"})
        if k.get("actual") is None:
            errors.append({"kpi_code": k["kpi_code"], "kpi_name": k["kpi_name"], "field": "actual", "message": f"{k['kpi_name']}: monthly actual is required"})
        elif float(k["actual"]) < 0:
            errors.append({"kpi_code": k["kpi_code"], "kpi_name": k["kpi_name"], "field": "actual", "message": f"{k['kpi_name']}: negative values are not allowed"})

    if errors:
        raise HTTPException(status_code=400, detail={"message": errors[0]["message"], "errors": errors})

    ap = await resolve_approver(user["id"])
    if not ap:
        raise HTTPException(status_code=400, detail="No approver is configured for your monthly scorecard")

    entry = {
        "action": "SUBMITTED",
        "by": user["id"],
        "by_name": user["name"],
        "comment": payload.comment,
        "at": now_iso(),
    }
    updates = {
        **sheet,
        "status": "SUBMITTED",
        "locked": True,
        "approver_id": ap["id"],
        "approver_name": ap["name"],
        "submitted_at": now_iso(),
        "decided_at": None,
        "decided_by": None,
        "decided_by_name": None,
        "decision_comment": payload.comment,
        "updated_at": now_iso(),
        "history": (sheet.get("history") or []) + [entry],
    }
    await db.monthly_kpi_sheets.update_one({"id": sheet["id"]}, {"$set": updates})

    await audit(
        user,
        "MONTHLY_SCORECARD_SUBMITTED",
        "monthly_kpi_sheet",
        sheet["id"],
        details={"month": payload.month, "approver_id": ap["id"], "overall_score": updates["overall_score"]},
        previous={"status": sheet.get("status")},
        new={"status": "SUBMITTED", "overall_score": updates["overall_score"]},
    )
    # Notify HOD (approval pending) + Employee (submission confirmation)
    await notify(
        ap,
        "SCORECARD_SUBMITTED",
        f"HOD Approval Pending: {user['name']} submitted {payload.month} KPI scorecard ({updates['overall_score']}%)",
        "/app/targets?tab=scorecard",
        f"mkpi-submit:{sheet['id']}:{updates['submitted_at']}",
    )
    await notify(
        user,
        "SCORECARD_CONFIRMED",
        f"Submission Confirmed: Your {payload.month} KPI scorecard was sent to {ap['name']}",
        "/app/targets?tab=scorecard",
        f"mkpi-confirm:{sheet['id']}:{updates['submitted_at']}",
    )
    return updates


class DecisionIn(BaseModel):
    comment: str = ""


async def _decide_sheet(sheet_id: str, user: dict, action: str, comment: str) -> dict:
    sheet = await db.monthly_kpi_sheets.find_one({"id": sheet_id}, {"_id": 0})
    if not sheet:
        raise HTTPException(status_code=404, detail="Monthly KPI scorecard not found")
    if sheet["user_id"] == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot approve or return your own monthly scorecard")
    is_hod_or_approver = sheet.get("approver_id") == user["id"] or any(has_permission(user, p) for p in ("HOD_VIEW", "SYSTEM_ADMIN"))
    if not is_hod_or_approver:
        raise HTTPException(status_code=403, detail="Only the HOD or designated approver can act on this scorecard")

    need = {"APPROVED": "SUBMITTED", "RETURNED": "SUBMITTED", "REOPENED": "APPROVED"}[action]
    if sheet["status"] != need:
        raise HTTPException(status_code=400, detail=f"Scorecard must be {need.lower()} to perform this action")
    if action in ("RETURNED", "REOPENED") and len(comment.strip()) < 3:
        raise HTTPException(status_code=400, detail="Please enter review comments (minimum 3 characters)")

    new_status = "RETURNED" if action in ("RETURNED", "REOPENED") else "APPROVED"
    locked = new_status == "APPROVED"
    entry = {
        "action": action,
        "by": user["id"],
        "by_name": user["name"],
        "comment": comment,
        "at": now_iso(),
    }
    updates = {
        "status": new_status,
        "locked": locked,
        "decided_at": now_iso(),
        "decided_by": user["id"],
        "decided_by_name": user["name"],
        "decision_comment": comment,
        "updated_at": now_iso(),
    }
    await db.monthly_kpi_sheets.update_one(
        {"id": sheet_id},
        {"$set": updates, "$push": {"history": entry}},
    )
    await audit(
        user,
        f"MONTHLY_SCORECARD_{action}",
        "monthly_kpi_sheet",
        sheet_id,
        details={"user_id": sheet["user_id"], "month": sheet["month"], "comment": comment},
        previous={"status": sheet["status"]},
        new={"status": new_status, "locked": locked},
    )

    emp = await db.users.find_one({"id": sheet["user_id"]}, {"_id": 0, "password_hash": 0})
    if emp:
        msg_verb = "approved & locked" if action == "APPROVED" else ("returned for correction" if action == "RETURNED" else "reopened for revision")
        await notify(
            emp,
            f"SCORECARD_{action}",
            f"Your {sheet['month']} KPI scorecard was {msg_verb} by {user['name']}",
            "/app/targets?tab=scorecard",
            f"mkpi-{action.lower()}:{sheet_id}:{updates['decided_at']}",
        )
    return await db.monthly_kpi_sheets.find_one({"id": sheet_id}, {"_id": 0})


@router.post("/monthly-kpis/{sheet_id}/approve")
async def approve_monthly_kpi_sheet(sheet_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _decide_sheet(sheet_id, user, "APPROVED", payload.comment)


@router.post("/monthly-kpis/{sheet_id}/return")
async def return_monthly_kpi_sheet(sheet_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _decide_sheet(sheet_id, user, "RETURNED", payload.comment)


@router.post("/monthly-kpis/{sheet_id}/reopen")
async def reopen_monthly_kpi_sheet(sheet_id: str, payload: DecisionIn, user: dict = Depends(get_current_user)):
    return await _decide_sheet(sheet_id, user, "REOPENED", payload.comment)
