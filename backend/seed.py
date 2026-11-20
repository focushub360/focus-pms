"""Idempotent seed: bootstrap super admin + roles + the six team members."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

from auth import hash_password
from permissions_catalog import PERMISSIONS, SEED_ROLES

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


SEED_TEAM = [
    # name, email, designation, role_code, functional_resp
    ("Manoj Mohan", "manoj.mohan@focusengineering.in", "Head of Sales & Marketing", "HEAD_OF_DEPARTMENT", "Head of Department"),
    ("DJ Sir", "dj.sir@focusengineering.in", "Management Board Member", "MANAGEMENT_BOARD", "Management Board"),
    ("Vijay Devadas", "vijay.devadas@focusengineering.in", "Business Analysis & MIS", "MIS_BUSINESS_ANALYST", "Business Analysis & MIS"),
    ("Satvinder Kaur", "satvinder.kaur@focusengineering.in", "Creative & Marketing", "MARKETING_MANAGER", "Creative & Marketing"),
    ("Kabir Baweja", "kabir.baweja@focusengineering.in", "Business Development", "SALES_MARKETING_CONTRIBUTOR", "Business Development"),
    ("Kriti Singh", "kriti.singh@focusengineering.in", "Business Development", "SALES_MARKETING_CONTRIBUTOR", "Business Development"),
    ("Mounika Naidu", "mounika.naidu@focusengineering.in", "Business Development", "SALES_MARKETING_CONTRIBUTOR", "Business Development"),
]


async def run_seed(db) -> None:
    # 1. Permissions catalog (reference)
    for code, desc in PERMISSIONS.items():
        await db.permissions.update_one(
            {"code": code},
            {"$set": {"code": code, "description": desc}},
            upsert=True,
        )

    # 2. Roles (upsert; preserve custom roles)
    for role in SEED_ROLES:
        existing = await db.roles.find_one({"code": role["code"]})
        if existing:
            await db.roles.update_one(
                {"code": role["code"]},
                {"$set": {
                    "name": role["name"],
                    "description": role["description"],
                    "permissions": role["permissions"],
                    "is_system": True,
                    "updated_at": _now_iso(),
                }},
            )
        else:
            await db.roles.insert_one({
                "id": str(uuid.uuid4()),
                "code": role["code"],
                "name": role["name"],
                "description": role["description"],
                "permissions": role["permissions"],
                "is_system": True,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            })

    # 3. Bootstrap super admin — ONCE ONLY
    bootstrap_email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "kiran@focusengineering.in").lower().strip()
    existing_admin = await db.users.find_one({"email": bootstrap_email})

    if not existing_admin:
        bootstrap_pwd = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "Kiran@123")
        admin_role = await db.roles.find_one({"code": "SYSTEM_ADMINISTRATOR"})
        all_perms = list(PERMISSIONS.keys())
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id,
            "employee_id": "FE-ADMIN-001",
            "name": os.environ.get("BOOTSTRAP_ADMIN_NAME", "Kiran Kulkarni"),
            "email": bootstrap_email,
            "mobile": "",
            "designation": "Sales, Marketing & Operations",
            "department": "Sales & Marketing",
            "functional_responsibility": "Operations & Process Coordination",
            "reporting_manager_id": None,
            "team": "Integrated Sales & Marketing",
            "joining_date": _now_iso(),
            "employment_status": "Active",
            "is_active": True,
            "is_super_admin": True,
            "roles": [admin_role["id"]] if admin_role else [],
            "role_codes": ["SYSTEM_ADMINISTRATOR"],
            "permissions": all_perms,
            "data_visibility": "ALL",
            "is_sales_contributor": True,
            "sales_target_eligible": True,
            "activity_kpi_eligible": True,
            "password_hash": hash_password(bootstrap_pwd),
            "must_change_password": True,
            "email_verified": True,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "last_login_at": None,
        })
        logger.info("[SEED] Bootstrap super admin created: %s", bootstrap_email)
    else:
        logger.info("[SEED] Super admin already exists — skipping")

    # 4. Six team members + DJ Sir + Manoj (if missing). All six get shared sales accountability.
    admin_user = await db.users.find_one({"email": bootstrap_email})
    super_admin_id = admin_user["id"] if admin_user else None
    manoj_user = await db.users.find_one({"email": "manoj.mohan@focusengineering.in"})
    manoj_id = manoj_user["id"] if manoj_user else None

    for name, email, designation, role_code, func_resp in SEED_TEAM:
        if await db.meta.find_one({"key": "team_seeded"}):
            break
        existing = await db.users.find_one({"$or": [{"email": email}, {"name": name}]})
        role = await db.roles.find_one({"code": role_code})
        perms = role["permissions"] if role else []
        is_contrib = role_code not in ("MANAGEMENT_BOARD",)
        reporting_mgr = None
        if role_code != "HEAD_OF_DEPARTMENT" and role_code != "MANAGEMENT_BOARD":
            reporting_mgr = manoj_id
        if existing:
            continue  # don't overwrite custom edits
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "employee_id": f"FE-{email.split('@')[0].upper()[:8]}",
            "name": name,
            "email": email,
            "mobile": "",
            "designation": designation,
            "department": "Sales & Marketing" if role_code != "MANAGEMENT_BOARD" else "Management Board",
            "functional_responsibility": func_resp,
            "reporting_manager_id": reporting_mgr,
            "team": "Integrated Sales & Marketing" if role_code != "MANAGEMENT_BOARD" else "Management Board",
            "joining_date": _now_iso(),
            "employment_status": "Active",
            "is_active": True,
            "is_super_admin": False,
            "roles": [role["id"]] if role else [],
            "role_codes": [role_code],
            "permissions": perms,
            "data_visibility": "DEPARTMENT" if role_code == "HEAD_OF_DEPARTMENT" else ("ALL" if role_code == "MANAGEMENT_BOARD" else "OWN"),
            "is_sales_contributor": is_contrib,
            "sales_target_eligible": is_contrib,
            "activity_kpi_eligible": is_contrib,
            "password_hash": hash_password(uuid.uuid4().hex),  # locked — must use invite flow
            "must_change_password": True,
            "email_verified": False,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "created_by": super_admin_id,
            "last_login_at": None,
        })

    # 5. Default financial year
    await db.meta.update_one({"key": "team_seeded"}, {"$set": {"key": "team_seeded", "at": _now_iso()}}, upsert=True)
    await run_migrations(db)
    await seed_kpis(db)
    fy_doc = await db.financial_years.find_one({"code": "FY2026-27"})
    if not fy_doc:
        await db.financial_years.insert_one({
            "id": str(uuid.uuid4()),
            "code": "FY2026-27",
            "label": "FY 2026–27",
            "start_date": "2026-04-01",
            "end_date": "2027-03-31",
            "is_active": True,
            "created_at": _now_iso(),
        })

    logger.info("[SEED] complete")


FUNC_PROFILE = [
    ("Operation", "OPERATIONS_COORDINATOR"),
    ("MIS", "MIS_BUSINESS_ANALYST"),
    ("Analysis", "MIS_BUSINESS_ANALYST"),
    ("Creative", "MARKETING_MANAGER"),
    ("Business Development", "SALES_MARKETING_CONTRIBUTOR"),
    ("Head", "HEAD_OF_DEPARTMENT"),
]


def kpi_profiles(user: dict) -> set[str]:
    out = set(user.get("role_codes") or [])
    fr = user.get("functional_responsibility") or ""
    for needle, code in FUNC_PROFILE:
        if needle.lower() in fr.lower():
            out.add(code)
    return out


async def run_migrations(db) -> None:
    from metrics import LEGACY_STAGE_MAP
    roles = {r["code"]: set(r.get("permissions") or []) async for r in db.roles.find({}, {"_id": 0})}
    async for u in db.users.find({"extra_permissions": {"$exists": False}}):
        role_perms = set().union(*[roles.get(c, set()) for c in u.get("role_codes") or []]) if u.get("role_codes") else set()
        extra = sorted(set(u.get("permissions") or []) - role_perms) if not u.get("is_super_admin") else []
        await db.users.update_one({"id": u["id"]}, {"$set": {"extra_permissions": extra}})
    # test accounts
    await db.users.update_many(
        {"$or": [{"employee_id": {"$regex": "TEST", "$options": "i"}}, {"name": {"$regex": "^test", "$options": "i"}},
                 {"email": {"$regex": "^test", "$options": "i"}}], "is_test": {"$ne": True}},
        {"$set": {"is_test": True}})
    # duplicates: same name or employee_id; keep the active (or earliest) record as primary
    users = [u async for u in db.users.find({"is_test": {"$ne": True}}, {"_id": 0})]
    groups: dict[str, list] = {}
    for u in users:
        groups.setdefault(u["name"].strip().lower(), []).append(u)
    for grp in groups.values():
        if len(grp) < 2:
            continue
        grp.sort(key=lambda x: (not x.get("is_active", True), x.get("created_at") or ""))
        primary = grp[0]
        for dup in grp[1:]:
            if not dup.get("is_duplicate") and not dup.get("is_active", True):
                await db.users.update_one({"id": dup["id"]}, {"$set": {"is_duplicate": True, "duplicate_of": primary["id"]}})
    for old, new in LEGACY_STAGE_MAP.items():
        await db.opportunities.update_many({"stage": old}, {"$set": {"stage": new}})
    await db.settings.update_one(
        {"key": "kpi_thresholds"},
        {"$setOnInsert": {"key": "kpi_thresholds", "achieved": 100, "on_track": 80, "at_risk": 60}},
        upsert=True)


async def seed_kpis(db, only_user_id: str | None = None) -> None:
    from kpi_catalog import KPI_CATEGORIES, KPI_DEFINITIONS, LOWER_IS_BETTER, SYSTEM_KPI_MAP, ALL_SALES
    for code, label in KPI_CATEGORIES:
        await db.kpi_categories.update_one({"code": code}, {"$set": {"code": code, "label": label}}, upsert=True)
    for code, name, cat, unit, formula, freq, roles in KPI_DEFINITIONS:
        if await db.kpi_definitions.find_one({"code": code}):
            continue
        await db.kpi_definitions.insert_one({
            "id": str(uuid.uuid4()), "code": code, "name": name, "category": cat,
            "description": formula, "unit": unit, "formula": formula, "frequency": freq,
            "applicable_roles": roles, "applies_to_all_sales": roles == ALL_SALES,
            "direction": "lower" if code in LOWER_IS_BETTER else "higher",
            "data_source": "SYSTEM" if code in SYSTEM_KPI_MAP else "MANUAL",
            "is_active": True, "is_custom": False, "approval_status": "APPROVED",
            "created_at": _now_iso(), "updated_at": _now_iso(),
        })
    if not only_user_id and await db.meta.find_one({"key": "kpi_assignments_seeded"}):
        return
    defs = [d async for d in db.kpi_definitions.find({"is_active": True}, {"_id": 0})]
    uflt = {"is_test": {"$ne": True}, "is_duplicate": {"$ne": True}, "is_sales_contributor": True}
    if only_user_id:
        uflt["id"] = only_user_id
    async for u in db.users.find(uflt, {"_id": 0}):
        prof = kpi_profiles(u)
        for d in defs:
            if not (d["applies_to_all_sales"] or prof & set(d["applicable_roles"])):
                continue
            if await db.kpi_assignments.find_one({"user_id": u["id"], "kpi_code": d["code"], "fy_code": "FY2026-27"}):
                continue
            await db.kpi_assignments.insert_one({
                "id": str(uuid.uuid4()), "user_id": u["id"], "kpi_code": d["code"], "fy_code": "FY2026-27",
                "frequency": d["frequency"], "target_value": None, "actual_value": None, "weightage": None,
                "start_date": "2026-04-01", "end_date": "2027-03-31", "responsible_owner_id": u["id"],
                "is_active": True, "approval_status": "DRAFT", "actual_status": None,
                "created_at": _now_iso(), "updated_at": _now_iso(), "actual_updated_at": None,
            })
    if only_user_id:
        return
    await db.meta.update_one({"key": "kpi_assignments_seeded"}, {"$set": {"key": "kpi_assignments_seeded", "at": _now_iso()}}, upsert=True)
