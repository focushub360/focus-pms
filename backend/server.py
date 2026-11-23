"""Focus PMS — Sales & Marketing Performance Management System.
FastAPI backend with MongoDB. All routes under /api."""
from __future__ import annotations

import logging
import re
import os
import secrets as pysecrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from auth import (
    create_access_token, get_current_user, hash_password, require_any_permission, require_permission,
    set_db, verify_password,
)
from email_service import send_invite_email, send_password_reset_email
from permissions_catalog import PERMISSIONS
from seed import run_seed, seed_kpis
from core import audit, client, db, now_iso
from kpi_routes import router as kpi_router
from dashboard_routes import router as dashboard_router
from activity_routes import router as activity_router
from daily_routes import router as daily_router
from alerts_routes import router as alerts_router
from import_routes import router as import_router
from reports_routes import router as reports_router
from storage import init_storage
from phase2_routes import apply_core_defaults, init_approver_settings, router as phase2_router
from metrics import STAGES
from db_indexes import ensure_indexes

logger = logging.getLogger("focus-pms")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

set_db(db)

app = FastAPI(
    title="TaskBoard",
    description="TaskBoard — Sales & Marketing Performance Management System API",
    version="1.0.0",
)
api = APIRouter(prefix="/api")

# CORS Configuration
_cors_env = os.environ.get("CORS_ORIGINS", "*").strip()
if _cors_env == "*":
    _allowed_origins = ["*"]
else:
    _allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

_app_public_url = os.environ.get("APP_PUBLIC_URL", "").strip().rstrip("/")
if _app_public_url and _app_public_url not in _allowed_origins and "*" not in _allowed_origins:
    _allowed_origins.append(_app_public_url)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def strip_sensitive(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("_id", "password_hash")}


# ─────────────────────────────────── MODELS ───────────────────────────────────
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AcceptInviteIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class RequestResetIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class EmployeeIn(BaseModel):
    name: str
    employee_id: Optional[str] = None
    email: EmailStr
    mobile: Optional[str] = ""
    designation: str
    department: str = "Sales & Marketing"
    functional_responsibility: str = ""
    reporting_manager_id: Optional[str] = None
    team: str = "Integrated Sales & Marketing"
    joining_date: Optional[str] = None
    employment_status: str = "Active"
    role_codes: List[str] = Field(default_factory=list)
    extra_permissions: List[str] = Field(default_factory=list)
    data_visibility: str = "OWN"  # OWN, TEAM, DEPARTMENT, ALL
    is_sales_contributor: bool = True
    sales_target_eligible: bool = True
    activity_kpi_eligible: bool = True


class EmployeeUpdateIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    employee_id: Optional[str] = None
    mobile: Optional[str] = None
    designation: Optional[str] = None
    functional_responsibility: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    team: Optional[str] = None
    employment_status: Optional[str] = None
    role_codes: Optional[List[str]] = None
    extra_permissions: Optional[List[str]] = None
    data_visibility: Optional[str] = None
    is_sales_contributor: Optional[bool] = None
    sales_target_eligible: Optional[bool] = None
    activity_kpi_eligible: Optional[bool] = None
    is_active: Optional[bool] = None


class RoleIn(BaseModel):
    code: str
    name: str
    description: str = ""
    permissions: List[str] = Field(default_factory=list)


class ContributorSplit(BaseModel):
    user_id: str
    credit_pct: float  # 0..100


class OpportunityIn(BaseModel):
    title: str
    account_name: str
    decision_maker: str = ""
    stage: str = "New"
    value_inr: float = Field(default=0, ge=0)
    probability: float = Field(default=0, ge=0, le=100)
    service_category: str = ""
    po_reference: str = ""
    won_lost_reason: str = ""
    next_action: str = ""
    next_action_date: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    expected_close_date: Optional[str] = None
    primary_owner_id: str
    contributors: List[ContributorSplit] = Field(default_factory=list)
    notes: str = ""


class LeadIn(BaseModel):
    name: str
    company: str
    email: Optional[str] = None
    phone: Optional[str] = None
    source: str = "Outbound"
    campaign_id: Optional[str] = None
    status: str = "New"
    owner_id: str
    notes: str = ""


class AccountIn(BaseModel):
    name: str
    industry: str = ""
    city: str = ""
    primary_contact: str = ""
    primary_contact_email: Optional[str] = None
    primary_contact_phone: str = ""
    owner_id: str


class CampaignIn(BaseModel):
    name: str
    channel: str = "Email"
    status: str = "Planned"  # Planned, Running, Completed
    budget_inr: float = 0
    spend_inr: float = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    owner_id: str
    notes: str = ""


# ─────────────────────────────────── AUTH ─────────────────────────────────────
@api.post("/auth/login")
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials or deactivated account")
    if not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user["id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_iso()}})
    await audit(user, "LOGIN", "user", user["id"], {})
    return {
        "access_token": token, "token_type": "bearer",
        "must_change_password": user.get("must_change_password", False),
        "user": strip_sensitive(user),
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return strip_sensitive(user)


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not verify_password(payload.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "must_change_password": False, "updated_at": now_iso(),
        }},
    )
    await audit(user, "PASSWORD_CHANGE", "user", user["id"], {})
    return {"ok": True}


@api.post("/auth/accept-invite")
async def accept_invite(payload: AcceptInviteIn):
    invite = await db.invitations.find_one({"token": payload.token, "status": "pending"})
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or used invitation")
    if datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation expired")
    await db.users.update_one(
        {"id": invite["user_id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "must_change_password": False,
            "email_verified": True,
            "updated_at": now_iso(),
        }},
    )
    await db.invitations.update_one({"token": payload.token}, {"$set": {"status": "accepted", "accepted_at": now_iso()}})
    user = await db.users.find_one({"id": invite["user_id"]})
    await audit(user, "INVITE_ACCEPTED", "user", user["id"], {})
    return {"ok": True}


@api.post("/auth/request-reset")
async def request_reset(payload: RequestResetIn):
    user = await db.users.find_one({"email": payload.email.lower().strip()})
    # Do not reveal account existence
    if user and user.get("is_active", True):
        token = pysecrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "id": str(uuid.uuid4()), "token": token, "user_id": user["id"],
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "status": "pending",
        })
        try:
            await send_password_reset_email(to=user["email"], name=user["name"], token=token)
        except Exception as e:
            logger.warning(f"reset email failed: {e}")
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn):
    pr = await db.password_resets.find_one({"token": payload.token, "status": "pending"})
    if not pr or datetime.fromisoformat(pr["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    await db.users.update_one(
        {"id": pr["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False, "updated_at": now_iso()}},
    )
    await db.password_resets.update_one({"token": payload.token}, {"$set": {"status": "used", "used_at": now_iso()}})
    return {"ok": True}


# ───────────────────────── USERS / ONBOARDING ─────────────────────────
PRIVILEGED_ROLES = {"SYSTEM_ADMINISTRATOR"}
PRIVILEGED_PERMS = {"SYSTEM_ADMIN"}


def guard_elevation(actor: dict, target: dict | None, role_codes, extra_perms, self_fields: set | None = None) -> None:
    """Block self-elevation and granting of privileged access by non-super-admins."""
    if actor.get("is_super_admin"):
        return
    if target and target["id"] == actor["id"] and self_fields:
        raise HTTPException(status_code=403, detail="You cannot change your own roles, permissions, visibility or status")
    role_codes = set(role_codes or []) - set((target or {}).get("role_codes") or [])
    extra_perms = set(extra_perms or []) - set((target or {}).get("extra_permissions") or [])
    if role_codes and PRIVILEGED_ROLES & set(role_codes):
        raise HTTPException(status_code=403, detail="Only the Super Administrator can assign the System Administrator role")
    if extra_perms and PRIVILEGED_PERMS & set(extra_perms):
        raise HTTPException(status_code=403, detail="Only the Super Administrator can grant system administration")
    actor_perms = set(actor.get("permissions") or [])
    if extra_perms and not set(extra_perms) <= actor_perms | {"USER_VIEW", "SALES_REPORT_VIEW", "TARGETS_VIEW"}:
        missing = sorted(set(extra_perms) - actor_perms)
        raise HTTPException(status_code=403, detail=f"You cannot grant permissions you do not hold: {', '.join(missing)}")


async def _permissions_for_roles(role_codes: List[str]) -> List[str]:
    perms: set[str] = set()
    async for r in db.roles.find({"code": {"$in": role_codes}}):
        perms.update(r.get("permissions") or [])
    return sorted(perms)


@api.get("/users")
async def list_users(user: dict = Depends(require_any_permission("USER_ONBOARDING_ADMIN", "USER_VIEW", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "SALES_REPORT_VIEW"))):
    out = []
    async for u in db.users.find({}, {"_id": 0, "password_hash": 0}):
        out.append(u)
    return out


@api.post("/users")
async def create_user(payload: EmployeeIn, admin: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    if payload.employee_id and await db.users.find_one({"employee_id": payload.employee_id.strip(), "is_duplicate": {"$ne": True}}):
        raise HTTPException(status_code=400, detail="A user with this Employee ID already exists")
    guard_elevation(admin, None, payload.role_codes, payload.extra_permissions)
    role_perms = await _permissions_for_roles(payload.role_codes)
    role_ids = [r["id"] async for r in db.roles.find({"code": {"$in": payload.role_codes}}, {"id": 1})]
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "employee_id": payload.employee_id or f"FE-{user_id[:8].upper()}",
        "name": payload.name,
        "email": email,
        "mobile": payload.mobile or "",
        "designation": payload.designation,
        "department": payload.department,
        "functional_responsibility": payload.functional_responsibility,
        "reporting_manager_id": payload.reporting_manager_id,
        "team": payload.team,
        "joining_date": payload.joining_date or now_iso(),
        "employment_status": payload.employment_status,
        "is_active": True,
        "is_super_admin": False,
        "roles": role_ids,
        "role_codes": payload.role_codes,
        "permissions": sorted(set(role_perms) | set(payload.extra_permissions)),
        "extra_permissions": sorted(set(payload.extra_permissions)),
        "is_test": False, "is_duplicate": False,
        "status_history": [{"status": "Active", "employment_status": payload.employment_status, "by": admin["id"], "at": now_iso()}],
        "data_visibility": payload.data_visibility,
        "is_sales_contributor": payload.is_sales_contributor,
        "sales_target_eligible": payload.sales_target_eligible,
        "activity_kpi_eligible": payload.activity_kpi_eligible,
        "password_hash": hash_password(uuid.uuid4().hex),  # locked; set via invite
        "must_change_password": True,
        "email_verified": False,
        "created_at": now_iso(), "updated_at": now_iso(),
        "created_by": admin["id"], "last_login_at": None,
    }
    await db.users.insert_one(user)
    if payload.is_sales_contributor:
        await seed_kpis(db, only_user_id=user_id)
        await apply_core_defaults(only_user_id=user_id)

    token = pysecrets.token_urlsafe(32)
    await db.invitations.insert_one({
        "id": str(uuid.uuid4()), "token": token, "user_id": user_id, "email": email,
        "status": "pending", "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat(),
        "created_by": admin["id"],
    })
    invite_link = f"{os.environ.get('APP_PUBLIC_URL','').rstrip('/')}/accept-invite/{token}"
    email_sent = False
    try:
        await send_invite_email(to=email, name=payload.name, token=token)
        email_sent = True
    except Exception as e:
        logger.warning(f"invite email failed: {e}")

    await audit(admin, "USER_CREATED", "user", user_id, {"email": email, "role_codes": payload.role_codes, "email_sent": email_sent})
    return {"user": strip_sensitive(user), "invite_link": invite_link, "email_sent": email_sent}


@api.patch("/users/{user_id}")
async def update_user(user_id: str, payload: EmployeeUpdateIn, admin: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("is_super_admin") and admin["id"] != target["id"]:
        raise HTTPException(status_code=403, detail="Cannot modify the Super Administrator")
    updates: dict[str, Any] = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if target.get("is_archived") and "is_active" in updates:
        raise HTTPException(status_code=400, detail="This employee is archived; use Restore to reactivate")
    if target.get("is_super_admin") and ({"role_codes", "extra_permissions", "is_active"} & set(updates)):
        raise HTTPException(status_code=403, detail="Super Administrator access cannot be changed")
    guard_elevation(admin, target, updates.get("role_codes"), updates.get("extra_permissions"),
                    self_fields=set(updates) & {"role_codes", "extra_permissions", "data_visibility", "is_active"})
    if "employee_id" in updates and await db.users.find_one({"employee_id": updates["employee_id"], "id": {"$ne": user_id}, "is_duplicate": {"$ne": True}}):
        raise HTTPException(status_code=400, detail="Another user already uses this Employee ID")
    if "is_active" in updates or "employment_status" in updates:
        hist = (target.get("status_history") or []) + [{
            "status": "Active" if updates.get("is_active", target.get("is_active", True)) else "Inactive",
            "employment_status": updates.get("employment_status", target.get("employment_status")),
            "by": admin["id"], "at": now_iso()}]
        updates["status_history"] = hist
    if "email" in updates:
        new_email = updates["email"].lower().strip()
        clash = await db.users.find_one({"email": new_email, "id": {"$ne": user_id}})
        if clash:
            raise HTTPException(status_code=400, detail="Another user already uses this email")
        updates["email"] = new_email
    if "role_codes" in updates:
        role_perms = await _permissions_for_roles(updates["role_codes"])
        role_ids = [r["id"] async for r in db.roles.find({"code": {"$in": updates["role_codes"]}}, {"id": 1})]
        updates["roles"] = role_ids
        extra = updates.get("extra_permissions", target.get("extra_permissions", []))
        updates["permissions"] = sorted(set(role_perms) | set(extra))
    if "extra_permissions" in updates:
        role_codes = updates.get("role_codes", target.get("role_codes", []))
        role_perms = await _permissions_for_roles(role_codes)
        updates["permissions"] = sorted(set(role_perms) | set(updates["extra_permissions"]))
    updates["updated_at"] = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": updates})
    skip = {"updated_at", "permissions", "roles", "status_history"}
    prev = {k: target.get(k) for k in updates if k not in skip and target.get(k) != updates[k]}
    new = {k: updates[k] for k in prev}
    action = "USER_UPDATED"
    if "role_codes" in prev:
        action = "ROLE_CHANGED"
    elif "extra_permissions" in prev:
        action = "PERMISSION_CHANGED"
    elif "is_active" in prev:
        action = "USER_ACTIVATED" if updates["is_active"] else "USER_DEACTIVATED"
    await audit(admin, action, "user", user_id, {"fields": list(prev.keys()), "user_id": user_id}, previous=prev, new=new)
    out = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return out


@api.post("/users/{user_id}/resend-invite")
async def resend_invite(user_id: str, admin: dict = Depends(require_permission("USER_ONBOARDING_ADMIN"))):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.invitations.update_many({"user_id": user_id, "status": "pending"}, {"$set": {"status": "expired"}})
    token = pysecrets.token_urlsafe(32)
    await db.invitations.insert_one({
        "id": str(uuid.uuid4()), "token": token, "user_id": user_id, "email": user["email"],
        "status": "pending", "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat(),
        "created_by": admin["id"],
    })
    invite_link = f"{os.environ.get('APP_PUBLIC_URL','').rstrip('/')}/accept-invite/{token}"
    email_sent = False
    try:
        await send_invite_email(to=user["email"], name=user["name"], token=token)
        email_sent = True
    except Exception as e:
        logger.warning(f"invite email failed: {e}")
    await audit(admin, "INVITE_RESENT", "user", user_id, {"email_sent": email_sent})
    return {"invite_link": invite_link, "email_sent": email_sent}


@api.get("/users/{user_id}/access-history")
async def access_history(user_id: str, admin: dict = Depends(require_any_permission("USER_ONBOARDING_ADMIN", "AUDIT_VIEW"))):
    out = []
    async for log in db.audit_logs.find({"$or": [{"user_id": user_id}, {"entity_id": user_id}]}, {"_id": 0}).sort("at", -1).limit(200):
        out.append(log)
    return out


# ─────────────────────────────── ROLES ─────────────────────────────────
@api.get("/roles")
async def list_roles(user: dict = Depends(get_current_user)):
    out = []
    async for r in db.roles.find({}, {"_id": 0}):
        out.append(r)
    return out


@api.post("/roles")
async def create_role(payload: RoleIn, admin: dict = Depends(require_permission("SYSTEM_ADMIN"))):
    if await db.roles.find_one({"code": payload.code}):
        raise HTTPException(status_code=400, detail="Role code already exists")
    role = {
        "id": str(uuid.uuid4()), **payload.model_dump(), "is_system": False,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.roles.insert_one(role)
    await audit(admin, "ROLE_CREATED", "role", role["id"], {"code": payload.code})
    role.pop("_id", None)
    return role


@api.patch("/roles/{role_id}")
async def update_role(role_id: str, payload: RoleIn, admin: dict = Depends(require_permission("SYSTEM_ADMIN"))):
    role = await db.roles.find_one({"id": role_id})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get("is_system") and role["code"] == "SYSTEM_ADMINISTRATOR":
        raise HTTPException(status_code=403, detail="Cannot modify System Administrator role")
    await db.roles.update_one({"id": role_id}, {"$set": {**payload.model_dump(exclude={"code"}), "updated_at": now_iso()}})
    await audit(admin, "ROLE_UPDATED", "role", role_id, {"code": role["code"]},
                previous={"permissions": role.get("permissions")}, new={"permissions": payload.permissions})
    return await db.roles.find_one({"id": role_id}, {"_id": 0})


@api.get("/permissions")
async def list_permissions(user: dict = Depends(get_current_user)):
    return [{"code": k, "description": v} for k, v in PERMISSIONS.items()]


# ───────────────────────────── OPPORTUNITIES ─────────────────────────────
def _stage_effects(data: dict, old: dict | None) -> None:
    if data.get("stage") not in STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Allowed: {', '.join(STAGES)}")
    old = old or {}
    if data["stage"] == "Won" and not (data.get("po_reference") or "").strip():
        raise HTTPException(status_code=400, detail="A PO / signed agreement reference is required to mark an opportunity Won")
    if data["stage"] in ("Lost", "On Hold") and not (data.get("won_lost_reason") or "").strip():
        raise HTTPException(status_code=400, detail=f"A reason is required to mark an opportunity {data['stage']}")
    if data["stage"] in ("Proposal Submitted", "Negotiation", "Won") and not old.get("proposal_submitted_at"):
        data["proposal_submitted_at"] = now_iso()
    if data["stage"] == "Won" and not old.get("confirmed_order_date") and not data.get("confirmed_order_date"):
        data["confirmed_order_date"] = now_iso()[:10]


def _check_split(contributors: List[ContributorSplit]) -> None:
    total = sum(c.credit_pct for c in contributors)
    if contributors and (total < 99.99 or total > 100.01):
        raise HTTPException(status_code=400, detail=f"Contributor credit splits must total 100 (got {total:.2f})")


async def _visible_filter(user: dict) -> dict:
    """Row-level filter for opportunities based on user's data visibility."""
    if user.get("is_super_admin") or user.get("data_visibility") == "ALL":
        return {}
    if user.get("data_visibility") in ("DEPARTMENT", "TEAM"):
        return {"department": user.get("department", "Sales & Marketing")}
    # OWN — primary or supporting contributor
    return {"$or": [{"primary_owner_id": user["id"]}, {"contributor_ids": user["id"]}]}


@api.get("/opportunities")
async def list_opportunities(user: dict = Depends(require_permission("SALES_OPPORTUNITY_MANAGE"))):
    flt = await _visible_filter(user)
    out = []
    async for o in db.opportunities.find(flt, {"_id": 0}).sort("created_at", -1):
        out.append(o)
    return out


@api.post("/opportunities")
async def create_opportunity(payload: OpportunityIn, user: dict = Depends(require_permission("SALES_OPPORTUNITY_MANAGE"))):
    _check_split(payload.contributors)
    body = payload.model_dump()
    _stage_effects(body, None)
    opp = {
        "id": str(uuid.uuid4()),
        **body,
        "contributor_ids": [c.user_id for c in payload.contributors],
        "department": "Sales & Marketing",
        "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.opportunities.insert_one(opp)
    await audit(user, "OPPORTUNITY_CREATED", "opportunity", opp["id"], {"title": payload.title, "value_inr": payload.value_inr})
    opp.pop("_id", None)
    return opp


@api.patch("/opportunities/{opp_id}")
async def update_opportunity(opp_id: str, payload: OpportunityIn, user: dict = Depends(require_permission("SALES_OPPORTUNITY_MANAGE"))):
    opp = await db.opportunities.find_one({"id": opp_id})
    if not opp:
        raise HTTPException(status_code=404, detail="Not found")
    # Visibility check for non-admins
    if not user.get("is_super_admin") and user.get("data_visibility") == "OWN":
        if opp["primary_owner_id"] != user["id"] and user["id"] not in (opp.get("contributor_ids") or []):
            raise HTTPException(status_code=403, detail="Not authorised for this opportunity")
    _check_split(payload.contributors)
    data = payload.model_dump()
    data["contributor_ids"] = [c.user_id for c in payload.contributors]
    _stage_effects(data, opp)
    data["updated_at"] = now_iso()
    await db.opportunities.update_one({"id": opp_id}, {"$set": data})
    if opp.get("stage") != data["stage"]:
        act = {"Won": "OPPORTUNITY_WON", "Lost": "OPPORTUNITY_LOST"}.get(data["stage"], "OPPORTUNITY_STAGE_CHANGED")
        await audit(user, act, "opportunity", opp_id, {"title": data["title"]}, previous={"stage": opp.get("stage")}, new={"stage": data["stage"]})
    if (opp.get("contributors") or []) != data["contributors"]:
        await audit(user, "SALES_CREDIT_SPLIT_CHANGED", "opportunity", opp_id, {"title": data["title"]},
                    previous={"contributors": opp.get("contributors")}, new={"contributors": data["contributors"]})
    changed = {k: opp.get(k) for k in ("value_inr", "primary_owner_id", "expected_close_date") if opp.get(k) != data.get(k)}
    if changed:
        await audit(user, "OPPORTUNITY_UPDATED", "opportunity", opp_id, {"title": data["title"]}, previous=changed,
                    new={k: data.get(k) for k in changed})
    return await db.opportunities.find_one({"id": opp_id}, {"_id": 0})


class StageMoveIn(BaseModel):
    stage: str
    po_reference: str = ""
    reason: str = ""


@api.post("/opportunities/{opp_id}/stage")
async def move_stage(opp_id: str, payload: StageMoveIn, user: dict = Depends(require_permission("SALES_OPPORTUNITY_MANAGE"))):
    opp = await db.opportunities.find_one({"id": opp_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Not found")
    if not user.get("is_super_admin") and user.get("data_visibility") == "OWN" and opp["primary_owner_id"] != user["id"] and user["id"] not in (opp.get("contributor_ids") or []):
        raise HTTPException(status_code=403, detail="Not authorised for this opportunity")
    data = {"stage": payload.stage, "po_reference": payload.po_reference or opp.get("po_reference", ""),
            "won_lost_reason": payload.reason or opp.get("won_lost_reason", "")}
    _stage_effects(data, opp)
    data["updated_at"] = now_iso()
    await db.opportunities.update_one({"id": opp_id}, {"$set": data})
    act = {"Won": "OPPORTUNITY_WON", "Lost": "OPPORTUNITY_LOST"}.get(payload.stage, "OPPORTUNITY_STAGE_CHANGED")
    await audit(user, act, "opportunity", opp_id, {"title": opp["title"], "po_reference": data["po_reference"], "reason": data["won_lost_reason"]},
                previous={"stage": opp.get("stage")}, new={"stage": payload.stage})
    return await db.opportunities.find_one({"id": opp_id}, {"_id": 0})


class ConvertLeadIn(BaseModel):
    opportunity_title: str = Field(min_length=2)
    value_inr: float = Field(default=0, ge=0)
    expected_close_date: Optional[str] = None
    service_category: str = ""


@api.post("/leads/{lead_id}/convert")
async def convert_lead(lead_id: str, payload: ConvertLeadIn, user: dict = Depends(require_permission("SALES_OPPORTUNITY_MANAGE"))):
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.get("related_opportunity_id"):
        raise HTTPException(status_code=400, detail="Lead is already converted")
    if not user.get("is_super_admin") and user.get("data_visibility") == "OWN" and lead.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only convert your own leads")
    acc = await db.accounts.find_one({"name": {"$regex": f"^{re.escape(lead['company'].strip())}$", "$options": "i"}}, {"_id": 0})
    if not acc:
        acc = {"id": str(uuid.uuid4()), "name": lead["company"].strip(), "industry": lead.get("industry", ""), "city": lead.get("city", ""),
               "primary_contact": lead["name"], "primary_contact_email": lead.get("email"), "primary_contact_phone": lead.get("phone") or "",
               "owner_id": lead["owner_id"], "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"], "source_lead_id": lead_id}
        await db.accounts.insert_one(acc)
        acc.pop("_id", None)
        await audit(user, "ACCOUNT_CREATED", "account", acc["id"], {"from_lead": lead_id})
    owner = lead["owner_id"]
    opp = {"id": str(uuid.uuid4()), "title": payload.opportunity_title, "account_name": acc["name"], "account_id": acc["id"], "lead_id": lead_id,
           "decision_maker": lead["name"], "stage": "Qualified", "value_inr": payload.value_inr, "probability": 0,
           "expected_close_date": payload.expected_close_date, "service_category": payload.service_category,
           "primary_owner_id": owner, "contributors": [{"user_id": owner, "credit_pct": 100.0}], "contributor_ids": [owner],
           "campaign_id": lead.get("campaign_id"), "notes": lead.get("notes", ""), "po_reference": "", "won_lost_reason": "",
           "department": "Sales & Marketing", "created_by": user["id"], "created_at": now_iso(), "updated_at": now_iso()}
    await db.opportunities.insert_one(opp)
    opp.pop("_id", None)
    await db.leads.update_one({"id": lead_id}, {"$set": {"status": "Converted", "related_account_id": acc["id"], "related_opportunity_id": opp["id"], "updated_at": now_iso()}})
    await audit(user, "LEAD_CONVERTED", "lead", lead_id, {"account_id": acc["id"], "opportunity_id": opp["id"]},
                previous={"status": lead.get("status")}, new={"status": "Converted"})
    return {"account": acc, "opportunity": opp}


# ───────────────────────── LEADS / ACCOUNTS / CAMPAIGNS ─────────────────────
async def _generic_crud_list(coll, user: dict) -> list:
    flt: dict = {}
    if not user.get("is_super_admin") and user.get("data_visibility") == "OWN":
        flt = {"owner_id": user["id"]}
    out = []
    async for o in coll.find(flt, {"_id": 0}).sort("created_at", -1):
        out.append(o)
    return out


@api.get("/leads")
async def list_leads(user: dict = Depends(require_permission("SALES_LEAD_MANAGE"))):
    return await _generic_crud_list(db.leads, user)


@api.post("/leads")
async def create_lead(payload: LeadIn, user: dict = Depends(require_permission("SALES_LEAD_MANAGE"))):
    dup_q = [{"name": {"$regex": f"^{re.escape(payload.name.strip())}$", "$options": "i"}, "company": {"$regex": f"^{re.escape(payload.company.strip())}$", "$options": "i"}}]
    if payload.email:
        dup_q.append({"email": {"$regex": f"^{re.escape(payload.email.strip())}$", "$options": "i"}})
    if await db.leads.find_one({"$or": dup_q}):
        raise HTTPException(status_code=400, detail="Duplicate lead: same contact/company or email already exists")
    n = await db.leads.count_documents({}) + 1
    lead = {"id": str(uuid.uuid4()), "lead_code": f"LD-{n:05d}", **payload.model_dump(), "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"]}
    await db.leads.insert_one(lead)
    await audit(user, "LEAD_CREATED", "lead", lead["id"], {})
    lead.pop("_id", None)
    return lead


@api.get("/accounts")
async def list_accounts(user: dict = Depends(require_permission("SALES_ACCOUNT_MANAGE"))):
    return await _generic_crud_list(db.accounts, user)


@api.post("/accounts")
async def create_account(payload: AccountIn, user: dict = Depends(require_permission("SALES_ACCOUNT_MANAGE"))):
    acc = {"id": str(uuid.uuid4()), **payload.model_dump(), "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"]}
    await db.accounts.insert_one(acc)
    await audit(user, "ACCOUNT_CREATED", "account", acc["id"], {})
    acc.pop("_id", None)
    return acc


@api.get("/campaigns")
async def list_campaigns(user: dict = Depends(require_any_permission("MARKETING_CAMPAIGN_MANAGE", "MARKETING_REPORT_VIEW"))):
    out = []
    async for c in db.campaigns.find({}, {"_id": 0}).sort("created_at", -1):
        out.append(c)
    return out


@api.post("/campaigns")
async def create_campaign(payload: CampaignIn, user: dict = Depends(require_permission("MARKETING_CAMPAIGN_MANAGE"))):
    c = {"id": str(uuid.uuid4()), **payload.model_dump(), "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"]}
    await db.campaigns.insert_one(c)
    await audit(user, "CAMPAIGN_CREATED", "campaign", c["id"], {})
    c.pop("_id", None)
    return c


# ───────────────────────────── DASHBOARDS ─────────────────────────────
# ─────────────────────────────── AUDIT ─────────────────────────────────
@api.get("/audit-logs")
async def audit_list(limit: int = Query(200, le=1000), user: dict = Depends(require_permission("AUDIT_VIEW"))):
    out = []
    async for log in db.audit_logs.find({}, {"_id": 0}).sort("at", -1).limit(limit):
        out.append(log)
    return out


# ─────────────────────────────── ROOT & HEALTH ─────────────────────────────────
@app.get("/")
async def root():
    return {
        "name": "TaskBoard Backend API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
@api.get("/health")
async def health():
    db_connected = False
    db_error = None
    try:
        await client.admin.command("ping")
        db_connected = True
    except Exception as e:
        db_error = str(e)

    return {
        "status": "ok" if db_connected else "degraded",
        "name": "TaskBoard",
        "database": {
            "status": "connected" if db_connected else "disconnected",
            "name": getattr(db, "name", "unknown"),
            "error": db_error,
        },
        "timestamp": now_iso(),
    }


app.include_router(api)
app.include_router(kpi_router)
app.include_router(dashboard_router)
app.include_router(phase2_router)
app.include_router(activity_router)
app.include_router(daily_router)
app.include_router(alerts_router)
app.include_router(import_router)
app.include_router(reports_router)


@app.on_event("startup")
async def _startup():
    logger.info("Initializing TaskBoard backend services...")
    # 1. Connectivity check
    try:
        await client.admin.command("ping")
        logger.info("MongoDB connection verified successfully: %s", getattr(db, "name", "default"))
    except Exception as e:
        logger.error("MongoDB initial ping warning: %s", e)

    # 2. Seed data & approver defaults
    try:
        await run_seed(db)
        await apply_core_defaults()
        await init_approver_settings()
    except Exception as e:
        logger.error("Seed execution warning: %s", e)

    # 3. Ensure comprehensive production database indexes
    try:
        await ensure_indexes(db)
    except Exception as e:
        logger.error("Database indexing warning: %s", e)

    # 4. Initialize storage
    try:
        init_storage()
    except Exception as e:
        logger.warning("Storage initialization warning: %s", e)

    logger.info("TaskBoard backend ready for production traffic")


@app.on_event("shutdown")
async def _shutdown():
    logger.info("Shutting down TaskBoard backend...")
    client.close()
