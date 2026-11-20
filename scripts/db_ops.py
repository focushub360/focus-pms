"""Focus PMS Database Management & Operations CLI.

Usage:
    python db_ops.py ping       # Check MongoDB connectivity
    python db_ops.py indexes    # Ensure all production indexes exist
    python db_ops.py seed       # Run database seeding (idempotent)
    python db_ops.py stats      # Print collection counts and database status
    python db_ops.py export     # Export data to a JSON backup file
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Setup path to backend
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

load_dotenv(backend_dir / ".env")

from core import client, db, ping_db
from db_indexes import ensure_indexes
from seed import run_seed


async def cmd_ping():
    print(f"Connecting to MongoDB...")
    ok = await ping_db()
    if ok:
        info = await client.server_info()
        print(f"[SUCCESS] MongoDB is connected and healthy.")
        print(f"  Server version: {info.get('version')}")
        print(f"  Active database: {getattr(db, 'name', 'unknown')}")
    else:
        print(f"[ERROR] Failed to connect to MongoDB.")
        sys.exit(1)


async def cmd_indexes():
    print("Checking and applying database indexes...")
    result = await ensure_indexes(db)
    print(f"[SUCCESS] Index check complete:")
    print(f"  Ensured/Created: {result['ensured']}")
    print(f"  Skipped (existing): {result['skipped']}")
    print(f"  Warnings: {result['errors']}")


async def cmd_seed():
    print("Running idempotent database seed...")
    try:
        await run_seed(db)
        print("[SUCCESS] Seeding completed.")
    except Exception as e:
        print(f"[ERROR] Seeding failed: {e}")
        sys.exit(1)


async def cmd_stats():
    print(f"Connecting to database: {getattr(db, 'name', 'unknown')}...")
    try:
        collections = await db.list_collection_names()
    except Exception as e:
        print(f"[ERROR] Failed to query MongoDB: {e}")
        print("Please verify MONGO_URL in backend/.env or ensure MongoDB is running.")
        sys.exit(1)

    print("-" * 50)
    total_docs = 0
    for coll_name in sorted(collections):
        count = await db[coll_name].count_documents({})
        total_docs += count
        print(f"  {coll_name.ljust(25)} : {count} documents")
    print("-" * 50)
    print(f"  Total collections : {len(collections)}")
    print(f"  Total documents   : {total_docs}")


async def cmd_export():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(__file__).resolve().parent / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"backup_{timestamp}.json"

    print(f"Exporting database to {out_file}...")
    data = {}
    collections = await db.list_collection_names()
    for coll_name in collections:
        docs = []
        async for doc in db[coll_name].find({}):
            doc.pop("_id", None)
            docs.append(doc)
        data[coll_name] = docs

    out_file.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    print(f"[SUCCESS] Exported {len(collections)} collections to {out_file}")


COMMANDS = {
    "ping": cmd_ping,
    "indexes": cmd_indexes,
    "seed": cmd_seed,
    "stats": cmd_stats,
    "export": cmd_export,
}


async def main():
    cmd = sys.argv[1].lower() if len(sys.argv) > 1 else "stats"
    if cmd not in COMMANDS:
        print(f"Unknown command: '{cmd}'. Available commands: {', '.join(COMMANDS.keys())}")
        sys.exit(1)
    await COMMANDS[cmd]()


if __name__ == "__main__":
    asyncio.run(main())
