"""Helper script to mint an access token for a given user email."""
import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

load_dotenv(backend_dir / ".env")

from auth import create_access_token
from core import db


async def main():
    if len(sys.argv) < 2:
        print("Usage: python mint_token.py <user_email>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        print(f"Error: User with email '{email}' not found.")
        sys.exit(1)

    token = create_access_token(user["id"])
    print(f"Token for {email} ({user.get('name')}):")
    print(token)


if __name__ == "__main__":
    asyncio.run(main())
