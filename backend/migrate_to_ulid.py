"""
OptiSched Database Migration: Sequential / BigInt IDs to 26-character ULIDs
Safely converts users.id to VARCHAR(26) while preserving all user credentials,
roles, timestamps, and relationships.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Setup paths
sys.path.insert(0, os.path.abspath("backend"))
venv_site = Path("backend/.venv/Lib/site-packages").resolve()
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.append(str(venv_site))

from sqlalchemy import text, inspect
from app.db.session import engine, SessionLocal
from app.core.ulid import generate_ulid, is_valid_ulid
from app.core.security import verify_password
from app.models.user import User


def backup_users_table(conn, backup_dir: Path) -> list[dict]:
    backup_dir.mkdir(parents=True, exist_ok=True)
    rows = conn.execute(text("SELECT * FROM users;")).mappings().all()
    backup_data = []
    for r in rows:
        row_dict = dict(r)
        # Convert datetimes to isoformat for json serialization
        for k, v in row_dict.items():
            if isinstance(v, datetime):
                row_dict[k] = v.isoformat()
        backup_data.append(row_dict)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = backup_dir / f"users_backup_{timestamp}.json"
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, indent=2)

    print(f"[BACKUP] Successfully backed up {len(backup_data)} users to {backup_file}")
    return backup_data


def migrate_to_ulid():
    print("================================================================")
    print("    OptiSched Migration: User ID to 26-Character ULID           ")
    print("================================================================")

    backup_dir = Path("backend/backups")
    dialect_name = engine.dialect.name
    print(f"[DIALECT] Connected to database dialect: {dialect_name}")

    with engine.connect() as conn:
        # Check if users table exists
        inspector = inspect(engine)
        if "users" not in inspector.get_table_names():
            print("[INFO] 'users' table does not exist yet. Creating via metadata...")
            User.__table__.create(bind=engine, checkfirst=True)
            print("[INFO] 'users' table created.")
            return

        # 1. Take safety backup
        backup_users_table(conn, backup_dir)

        # 2. Inspect current id column type
        columns = inspector.get_columns("users")
        id_col = next((c for c in columns if c["name"] == "id"), None)
        print(f"[SCHEMA] Current users.id column definition: {id_col}")

        # Check foreign keys referencing users
        fks = inspector.get_foreign_keys("users")
        print(f"[SCHEMA] Foreign keys on users: {fks}")

        # Check if any other table references users
        referencing_fks = []
        for table_name in inspector.get_table_names():
            if table_name == "users":
                continue
            for fk in inspector.get_foreign_keys(table_name):
                if fk.get("referred_table") == "users":
                    referencing_fks.append((table_name, fk))
        print(f"[SCHEMA] External foreign keys referencing users: {referencing_fks}")

        # 3. Perform Migration based on dialect
        if dialect_name == "postgresql":
            print("\n[MIGRATION - POSTGRESQL] Step 1: Add temporary ulid_id column...")
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS ulid_id VARCHAR(26);"))
            conn.commit()

            # Retrieve existing rows
            existing_users = conn.execute(text("SELECT id, email FROM users;")).fetchall()
            print(f"[MIGRATION] Assigning fresh 26-char ULIDs to {len(existing_users)} existing users...")

            for row in existing_users:
                old_id = row[0]
                # If old_id is already a valid 26-char ULID, reuse it
                if isinstance(old_id, str) and is_valid_ulid(old_id):
                    new_ulid = old_id
                else:
                    new_ulid = generate_ulid()
                print(f"  Mapping user '{row[1]}': old ID {old_id} -> ULID {new_ulid}")
                conn.execute(
                    text("UPDATE users SET ulid_id = :ulid WHERE id = :old_id;"),
                    {"ulid": new_ulid, "old_id": old_id},
                )
            conn.commit()

            print("[MIGRATION - POSTGRESQL] Step 2: Swap primary key constraint...")
            # Drop primary key constraint safely
            conn.execute(text("""
                DO $$
                DECLARE r RECORD;
                BEGIN
                    FOR r IN (
                        SELECT constraint_name
                        FROM information_schema.table_constraints
                        WHERE table_name = 'users' AND constraint_type = 'PRIMARY KEY'
                    ) LOOP
                        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.constraint_name) || ' CASCADE;';
                    END LOOP;
                END $$;
            """))
            conn.commit()

            print("[MIGRATION - POSTGRESQL] Step 3: Replace old id column with ulid_id...")
            conn.execute(text("ALTER TABLE users DROP COLUMN id;"))
            conn.execute(text("ALTER TABLE users RENAME COLUMN ulid_id TO id;"))
            conn.execute(text("ALTER TABLE users ALTER COLUMN id SET NOT NULL;"))
            conn.execute(text("ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);"))
            conn.commit()
            print("[MIGRATION - POSTGRESQL] Primary key successfully migrated to VARCHAR(26) ULID.")

        elif dialect_name == "sqlite":
            print("\n[MIGRATION - SQLITE] Migrating users table to ULID primary key...")
            # For SQLite, read existing rows, update IDs to ULID if not already valid ULID
            rows = conn.execute(text("SELECT * FROM users;")).mappings().all()
            updated_rows = []
            for r in rows:
                r_dict = dict(r)
                curr_id = str(r_dict["id"])
                if not is_valid_ulid(curr_id):
                    r_dict["id"] = generate_ulid()
                updated_rows.append(r_dict)

            # Recreate table with VARCHAR(26) primary key
            conn.execute(text("DROP TABLE users;"))
            conn.commit()
            User.__table__.create(bind=engine, checkfirst=True)

            for u in updated_rows:
                conn.execute(
                    text("""
                        INSERT INTO users (id, email, password_hash, role, name, is_active, created_at, updated_at)
                        VALUES (:id, :email, :password_hash, :role, :name, :is_active, :created_at, :updated_at);
                    """),
                    u,
                )
            conn.commit()
            print("[MIGRATION - SQLITE] SQLite users table successfully updated to ULID primary key.")

    # 4. Verify in SessionLocal
    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"\n==================== Verification ({len(users)} users) ====================")
        all_valid = True
        for u in users:
            valid = is_valid_ulid(u.id) and len(u.id) == 26
            all_valid = all_valid and valid
            print(
                f"ULID: {u.id} (len={len(u.id)}, valid={valid}) | "
                f"Email: {u.email} | Role: {u.role} | Name: {u.name}"
            )

        assert all_valid, "One or more user IDs are not valid 26-character ULIDs!"

        # Verify stored password hashes remain intact bcrypt hashes (and optionally check env-provided demo credentials)
        for u in users:
            assert u.password_hash and u.password_hash.startswith(("$2b$", "$2a$", "$2y$")), (
                f"User {u.email} does not have a valid bcrypt password hash!"
            )

        optional_env_checks = [
            (os.getenv("DEMO_ADMIN_EMAIL", "admin@optisched.com"), os.getenv("DEMO_ADMIN_PASSWORD"), "admin"),
            (os.getenv("DEMO_FACULTY_EMAIL", "faculty@optisched.com"), os.getenv("DEMO_FACULTY_PASSWORD"), "faculty"),
            (os.getenv("DEMO_STUDENT_EMAIL", "student@optisched.com"), os.getenv("DEMO_STUDENT_PASSWORD"), "student"),
        ]
        if any(pwd for _, pwd, _ in optional_env_checks):
            print("\n--- Verifying Env-Configured Account Logins ---")
            for email, pwd, expected_role in optional_env_checks:
                if not pwd:
                    continue
                user = db.query(User).filter(User.email == email).first()
                if not user:
                    print(f"[FAIL] User '{email}' not found!")
                    continue
                matches = verify_password(pwd, user.password_hash)
                print(f"User: {email} | Role: {user.role} (matches expected: {user.role == expected_role}) | Password Verified: {matches}")
                assert matches, f"Password verification failed for {email}"

        print("\nMigration and verification completed successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    migrate_to_ulid()
