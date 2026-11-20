"""Authentication, password hashing, JWT, permission guards."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

import logging

logger = logging.getLogger("focus-pms.auth")

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    JWT_SECRET = "focus-pms-production-jwt-secret-key-change-in-env"
    logger.warning("JWT_SECRET environment variable not set! Using fallback secret key. Please set JWT_SECRET in production.")
JWT_ALG = os.environ.get("JWT_ALG", "HS256")
JWT_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", "12"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, extra: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_TTL_HOURS)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# dependency injected at runtime from server.py
_db_ref: dict = {}


def set_db(db):
    _db_ref["db"] = db


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    user_id = payload.get("sub")
    db = _db_ref["db"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if user.get("is_super_admin"):
        from permissions_catalog import PERMISSIONS
        user["permissions"] = sorted(PERMISSIONS.keys())
        return user
    perms: set[str] = set(user.get("extra_permissions") or [])
    async for r in db.roles.find({"code": {"$in": user.get("role_codes") or []}}, {"permissions": 1}):
        perms.update(r.get("permissions") or [])
    user["permissions"] = sorted(perms)
    return user


def has_permission(user: dict, permission: str) -> bool:
    if user.get("is_super_admin"):
        return True
    perms = set(user.get("permissions") or [])
    return permission in perms


def require_permission(permission: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return user
    return _dep


def require_any_permission(*permissions: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("is_super_admin"):
            return user
        perms = set(user.get("permissions") or [])
        if not perms.intersection(permissions):
            raise HTTPException(
                status_code=403,
                detail=f"Missing any of: {', '.join(permissions)}",
            )
        return user
    return _dep
