"""Shared DB handle, connection pooling, time helper and audit writer."""
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger("focus-pms.core")

# Load environment variables from .env if present
load_dotenv(Path(__file__).parent / ".env")

# Support standard MongoDB environment variable names
MONGO_URL = (
    os.environ.get("MONGO_URL")
    or os.environ.get("MONGODB_URI")
    or os.environ.get("DATABASE_URL")
    or "mongodb://localhost:27017"
)
DB_NAME = os.environ.get("DB_NAME", "focus_pms")

# Production-ready Motor client configuration with connection pooling & timeouts
client: AsyncIOMotorClient = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=int(os.environ.get("MONGO_TIMEOUT_MS", "3000")),
    connectTimeoutMS=int(os.environ.get("MONGO_TIMEOUT_MS", "3000")),
    socketTimeoutMS=15000,
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", "50")),
    minPoolSize=int(os.environ.get("MONGO_MIN_POOL_SIZE", "5")),
    maxIdleTimeMS=45000,
    retryWrites=True,
)


def _resolve_database():
    """Auto-detect database from connection string path or fall back to DB_NAME."""
    try:
        default_db = client.get_default_database()
        if default_db is not None and default_db.name:
            return default_db
    except Exception:
        pass
    return client[DB_NAME]


db = _resolve_database()


async def ping_db() -> bool:
    """Ping MongoDB server to verify active connection."""
    try:
        await client.admin.command("ping")
        return True
    except Exception as e:
        logger.error("MongoDB ping error: %s", e)
        return False


def now_iso() -> str:
    """Return current UTC time in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


async def audit(user, action, module, record_id, details=None, previous=None, new=None):
    """Write an immutable audit log entry."""
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": (user or {}).get("id"),
            "user_name": (user or {}).get("name"),
            "user_email": (user or {}).get("email"),
            "action": action,
            "entity": module,
            "module": module,
            "entity_id": record_id,
            "record_id": record_id,
            "previous_value": previous,
            "new_value": new,
            "details": details or {},
            "at": now_iso(),
        })
    except Exception as e:
        logger.error("Failed to write audit log (%s on %s): %s", action, module, e)
