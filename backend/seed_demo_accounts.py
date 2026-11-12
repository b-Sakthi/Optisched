"""
OptiSched - Seed Local Development Demo Accounts.
- Reads demo account passwords strictly from environment variables.
- Never stores hardcoded passwords or silent fallback defaults.
- Hashes passwords with bcrypt (salt rounds=12) via app.core.security.hash_password.
- Never overwrites existing accounts or passwords unless explicitly requested (--update-existing).
- Never prints plaintext passwords or secret values.
"""

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv

if os.getenv("TESTING") != "1":
    load_dotenv(backend_dir / ".env")

from app.core.security import hash_password, verify_password
from app.core.ulid import generate_ulid, is_valid_ulid
from app.db.session import SessionLocal, engine
from app.models import User

REQUIRED_DEMO_SPECS = [
    {
        "role": "admin",
        "email_env": "DEMO_ADMIN_EMAIL",
        "default_email": "admin@optisched.com",
        "password_env": "DEMO_ADMIN_PASSWORD",
        "name": "OptiSched Administrator",
    },
    {
        "role": "faculty",
        "email_env": "DEMO_FACULTY_EMAIL",
        "default_email": "faculty@optisched.com",
        "password_env": "DEMO_FACULTY_PASSWORD",
        "name": "OptiSched Faculty Member",
    },
    {
        "role": "student",
        "email_env": "DEMO_STUDENT_EMAIL",
        "default_email": "student@optisched.com",
        "password_env": "DEMO_STUDENT_PASSWORD",
        "name": "OptiSched Student",
    },
]

DASHBOARD_MAP = {
    "admin": "/admin",
    "faculty": "/faculty",
    "student": "/student",
}


def load_demo_accounts_from_env() -> list[dict[str, str]]:
    """
    Loads demo account definitions from environment variables.
    Raises ValueError if any required password environment variable is missing or empty.
    """
    missing_vars = [
        spec["password_env"]
        for spec in REQUIRED_DEMO_SPECS
        if not os.getenv(spec["password_env"], "").strip()
    ]
    if missing_vars:
        raise ValueError(
            "Missing required environment variable(s) for demo seeding: "
            + ", ".join(missing_vars)
            + ". Set them in backend/.env or your shell before running this script."
        )

    accounts: list[dict[str, str]] = []
    for spec in REQUIRED_DEMO_SPECS:
        password = os.getenv(spec["password_env"], "").strip()
        if len(password) < 8:
            raise ValueError(
                f"Environment variable '{spec['password_env']}' must be at least 8 characters long."
            )
        email = os.getenv(spec["email_env"], spec["default_email"]).strip().lower()
        accounts.append(
            {
                "email": email,
                "password": password,
                "role": spec["role"],
                "name": spec["name"],
            }
        )
    return accounts


def sync_demo_accounts(
    accounts_data: list[dict[str, str]] | None = None,
    *,
    update_existing: bool = False,
    db_session=None,
) -> list[dict[str, object]]:
    """
    Creates missing demo accounts from environment configuration.
    Existing accounts are preserved untouched unless update_existing=True is explicitly specified.
    """
    if accounts_data is None:
        accounts_data = load_demo_accounts_from_env()

    owns_session = db_session is None
    if owns_session:
        User.__table__.create(bind=engine, checkfirst=True)
        db = SessionLocal()
    else:
        db = db_session

    results: list[dict[str, object]] = []

    try:
        for acc in accounts_data:
            email_clean = acc["email"].strip().lower()
            password = acc["password"]
            role = acc["role"].strip().lower()
            name = acc.get("name", "Demo User")

            existing_user = db.query(User).filter(User.email == email_clean).first()

            if existing_user and not update_existing:
                is_bcrypt_format = existing_user.password_hash.startswith(("$2b$", "$2a$", "$2y$"))
                results.append(
                    {
                        "email": existing_user.email,
                        "role": existing_user.role,
                        "status": "SKIPPED_EXISTS",
                        "is_bcrypt": is_bcrypt_format,
                        "login_verified": None,
                        "target_dashboard": DASHBOARD_MAP.get(existing_user.role, "/student"),
                    }
                )
                print(
                    f"[SKIPPED] Account '{email_clean}' already exists (ID: {existing_user.id}). Preserved existing password.",
                    flush=True,
                )
                continue

            pwd_hash = hash_password(password)

            if existing_user:
                if not is_valid_ulid(str(existing_user.id)):
                    existing_user.id = generate_ulid()
                existing_user.password_hash = pwd_hash
                existing_user.role = role
                existing_user.name = name
                existing_user.is_active = True
                status_str = "UPDATED_EXISTING"
                target_user = existing_user
                print(f"[UPDATED] Account '{email_clean}' updated (ID: {existing_user.id}).", flush=True)
            else:
                new_user = User(
                    id=generate_ulid(),
                    email=email_clean,
                    password_hash=pwd_hash,
                    role=role,
                    name=name,
                    is_active=True,
                )
                db.add(new_user)
                db.flush()
                status_str = "CREATED"
                target_user = new_user
                print(f"[CREATED] Account '{email_clean}' created with role '{role}' (ID: {new_user.id}).", flush=True)

            db.commit()

            is_valid_login = verify_password(password, target_user.password_hash)
            is_bcrypt_format = target_user.password_hash.startswith(("$2b$", "$2a$", "$2y$"))

            results.append(
                {
                    "email": target_user.email,
                    "role": target_user.role,
                    "status": status_str,
                    "is_bcrypt": is_bcrypt_format,
                    "login_verified": is_valid_login,
                    "target_dashboard": DASHBOARD_MAP.get(target_user.role, "/student"),
                }
            )

        return results
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    allow_overwrite = "--update-existing" in sys.argv[1:]
    try:
        summary = sync_demo_accounts(update_existing=allow_overwrite)
        print("\n--- Seed Summary ---", flush=True)
        for item in summary:
            print(
                f"- Email: {item['email']} | Role: {item['role']} | Status: {item['status']} | "
                f"Bcrypt: {item['is_bcrypt']} | Dashboard: {item['target_dashboard']}",
                flush=True,
            )
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
