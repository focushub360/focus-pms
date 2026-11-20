"""Object storage helper with local filesystem fallback for production independence."""
import logging
import os
from pathlib import Path
import mimetypes

import requests

logger = logging.getLogger("focus-pms.storage")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "focus-pms"
_key = None

LOCAL_UPLOADS_DIR = Path(__file__).parent / "uploads"


def has_remote_storage() -> bool:
    """Return whether remote object storage is configured."""
    return bool(os.environ.get("EMERGENT_LLM_KEY"))


def init_storage(force: bool = False):
    """Initialize remote object storage or ensure local upload folder exists."""
    global _key
    if not has_remote_storage():
        LOCAL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        return "local"

    if _key and not force:
        return _key
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
        r.raise_for_status()
        _key = r.json()["storage_key"]
        return _key
    except Exception as e:
        logger.warning("Remote storage init failed, using local storage fallback: %s", e)
        LOCAL_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        return "local"


def _call(method: str, path: str, headers: dict | None = None, **kw):
    for attempt in (0, 1):
        storage_key = init_storage(force=attempt == 1)
        r = requests.request(
            method,
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": storage_key, **(headers or {})},
            timeout=120,
            **kw,
        )
        if r.status_code != 404 or attempt:
            r.raise_for_status()
            return r


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload object to remote store or local uploads directory."""
    if has_remote_storage() and _key != "local":
        try:
            return _call("PUT", path, headers={"Content-Type": content_type}, data=data).json()
        except Exception as e:
            logger.warning("Remote put_object failed, falling back to local: %s", e)

    # Local filesystem storage
    file_path = LOCAL_UPLOADS_DIR / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(data)
    return {"path": path, "size": len(data), "storage": "local"}


def get_object(path: str) -> tuple[bytes, str]:
    """Retrieve object from remote store or local uploads directory."""
    if has_remote_storage() and _key != "local":
        try:
            r = _call("GET", path)
            return r.content, r.headers.get("Content-Type", "application/octet-stream")
        except Exception as e:
            logger.warning("Remote get_object failed, trying local: %s", e)

    # Local fallback
    file_path = LOCAL_UPLOADS_DIR / path
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")
    content = file_path.read_bytes()
    guessed_type, _ = mimetypes.guess_type(str(file_path))
    return content, guessed_type or "application/octet-stream"
