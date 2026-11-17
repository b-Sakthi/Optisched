"""
OptiSched - Default Admin User Initialization.
- Securely creates or updates the default Admin user using environment variables.
- Strictly enforces the minimum 8-character password policy across all tiers.
- Syncs the Admin account with both the Neon database (bcrypt) and Clerk Auth provider.
- Never stores or prints plaintext passwords.
- Assigns 26-character Crockford Base32 ULID and 'admin' role metadata.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

if os.getenv("TESTING") != "1":
    load_dotenv(backend_dir / ".env")

from app.core.security import (
    hash_password,
    verify_password,
    MIN_PASSWORD_LENGTH,
    validate_password_policy,
)
from app.core.ulid import generate_ulid, is_valid_ulid
from app.db.session import SessionLocal, engine
from app.models import User


def get_admin_credentials_from_env() -> tuple[str, str, str]:
    """
    Retrieves admin credentials from environment variables.
    Checks ADMIN_EMAIL / DEMO_ADMIN_EMAIL and ADMIN_PASSWORD / DEMO_ADMIN_PASSWORD.
    """
    email = (
        os.getenv("ADMIN_EMAIL")
        or os.getenv("DEMO_ADMIN_EMAIL")
        or "admin@optisched.com"
    ).strip().lower()

    password = (
        os.getenv("ADMIN_PASSWORD")
        or os.getenv("DEMO_ADMIN_PASSWORD")
        or ""
    ).strip()

    name = (
        os.getenv("ADMIN_NAME")
        or os.getenv("DEMO_ADMIN_NAME")
        or "OptiSched Administrator"
    ).strip()

    return email, password, name


def sync_clerk_admin_user(
    email: str,
    password: str,
    name: str = "OptiSched Administrator",
    *,
    force_update_password: bool = False,
) -> dict[str, object]:
    """
    Provisions or synchronizes the Admin account in Clerk using the Clerk REST API.
    Bypasses Clerk's default 15-character constraint using skip_password_checks=True
    to enforce the application's minimum 8-character policy.
    """
    secret_key = os.getenv("CLERK_SECRET_KEY", "").strip("\"'")
    if not secret_key or os.getenv("TESTING") == "1":
        return {"status": "SKIPPED_NO_KEY_OR_TESTING", "clerk_id": None}

    headers = {
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OptiSched/1.0",
    }

    # 1. Search for existing Clerk user by email
    list_url = f"https://api.clerk.com/v1/users?email_address={urllib.parse.quote(email)}"
    try:
        req = urllib.request.Request(list_url, headers=headers)
        with urllib.request.urlopen(req) as resp:
            existing_users = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"status": "CLERK_QUERY_FAILED", "error": str(exc), "clerk_id": None}

    name_parts = name.split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else "Administrator"

    if existing_users and len(existing_users) > 0:
        clerk_user = existing_users[0]
        user_id = clerk_user["id"]
        
        # Update metadata to ensure admin role
        try:
            meta_req = urllib.request.Request(
                f"https://api.clerk.com/v1/users/{user_id}/metadata",
                data=json.dumps({"public_metadata": {"role": "admin"}}).encode("utf-8"),
                method="PATCH",
                headers=headers,
            )
            with urllib.request.urlopen(meta_req) as resp:
                pass
        except Exception as exc:
            return {"status": "CLERK_META_UPDATE_FAILED", "error": str(exc), "clerk_id": user_id}

        # Update user profile and password if requested
        update_payload: dict[str, object] = {
            "first_name": first_name,
            "last_name": last_name,
            "bypass_client_trust": True,
        }
        if force_update_password and password:
            update_payload["password"] = password
            update_payload["skip_password_checks"] = True

        patch_req = urllib.request.Request(
            f"https://api.clerk.com/v1/users/{user_id}",
            data=json.dumps(update_payload).encode("utf-8"),
            method="PATCH",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(patch_req) as resp:
                updated = json.loads(resp.read().decode("utf-8"))
                return {
                    "status": "CLERK_UPDATED",
                    "clerk_id": updated["id"],
                    "email": email,
                    "role": "admin",
                }
        except Exception as exc:
            return {"status": "CLERK_UPDATE_FAILED", "error": str(exc), "clerk_id": user_id}

    # 2. User does not exist in Clerk -> Create new Clerk Admin user
    if not password:
        return {"status": "CLERK_CREATE_SKIPPED_NO_PASSWORD", "clerk_id": None}

    create_payload = {
        "email_address": [email],
        "password": password,
        "first_name": first_name,
        "last_name": last_name,
        "public_metadata": {"role": "admin"},
        "skip_password_checks": True,
        "bypass_client_trust": True,
    }
    create_req = urllib.request.Request(
        "https://api.clerk.com/v1/users",
        data=json.dumps(create_payload).encode("utf-8"),
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(create_req) as resp:
            created = json.loads(resp.read().decode("utf-8"))
            return {
                "status": "CLERK_CREATED",
                "clerk_id": created["id"],
                "email": email,
                "role": "admin",
            }
    except Exception as exc:
        return {"status": "CLERK_CREATE_FAILED", "error": str(exc), "clerk_id": None}


def ensure_admin_user_exists(
    email: str | None = None,
    password: str | None = None,
    name: str | None = None,
    *,
    force_update_password: bool = False,
    db_session=None,
) -> dict[str, object]:
    """
    Ensures a default Admin user exists in both the local DB and the Clerk Auth provider.
    Enforces minimum 8-character password policy.
    """
    env_email, env_password, env_name = get_admin_credentials_from_env()

    final_email = (email or env_email).strip().lower()
    final_password = (password or env_password).strip()
    final_name = (name or env_name).strip()

    if not final_email:
        final_email = "admin@optisched.com"

    owns_session = db_session is None
    if owns_session:
        User.__table__.create(bind=engine, checkfirst=True)
        db = SessionLocal()
    else:
        db = db_session

    try:
        existing_admin = db.query(User).filter(User.email == final_email).first()

        # Check password policy if creating or updating
        if final_password:
            validate_password_policy(final_password, role="admin")

        if existing_admin:
            if force_update_password and final_password:
                existing_admin.password_hash = hash_password(final_password)
                existing_admin.role = "admin"
                existing_admin.name = final_name
                existing_admin.is_active = True
                if not is_valid_ulid(str(existing_admin.id)):
                    existing_admin.id = generate_ulid()
                db.commit()
                db.refresh(existing_admin)
                db_status = "UPDATED"
                admin_user = existing_admin
            else:
                db_status = "EXISTS_PRESERVED"
                admin_user = existing_admin
        else:
            if not final_password:
                raise ValueError(
                    f"Admin password required to create account (minimum {MIN_PASSWORD_LENGTH} characters). "
                    "Set ADMIN_PASSWORD in environment."
                )
            admin_user = User(
                id=generate_ulid(),
                email=final_email,
                password_hash=hash_password(final_password),
                role="admin",
                name=final_name,
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
            db_status = "CREATED"

        # Sync Clerk user
        clerk_result = sync_clerk_admin_user(
            email=final_email,
            password=final_password,
            name=final_name,
            force_update_password=force_update_password,
        )

        # Verify password matches
        login_verified = (
            verify_password(final_password, admin_user.password_hash)
            if final_password
            else False
        )

        return {
            "id": admin_user.id,
            "email": admin_user.email,
            "role": admin_user.role,
            "name": admin_user.name,
            "db_status": db_status,
            "is_bcrypt": admin_user.password_hash.startswith(("$2b$", "$2a$", "$2y$")),
            "login_verified": login_verified,
            "clerk": clerk_result,
        }
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    force_update = "--update" in sys.argv or "--force" in sys.argv
    try:
        res = ensure_admin_user_exists(force_update_password=force_update)
        print("[SUCCESS] Admin account synchronized:")
        print(f"  - Email:        {res['email']}")
        print(f"  - Role:         {res['role']}")
        print(f"  - Database:     {res['db_status']} (ULID: {res['id']}, Bcrypt: {res['is_bcrypt']})")
        print(f"  - Clerk Auth:   {res['clerk']}")
    except ValueError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
