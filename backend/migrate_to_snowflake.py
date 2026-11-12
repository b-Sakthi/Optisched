import os
import sys
from pathlib import Path

# Setup paths
sys.path.insert(0, os.path.abspath("backend"))
venv_site_packages = Path("backend/.venv/Lib/site-packages").resolve()
if venv_site_packages.exists():
    sys.path.append(str(venv_site_packages))

from sqlalchemy import text
from app.db.session import engine, SessionLocal
from app.core.snowflake import get_snowflake_id
from app.models.user import User

def migrate_users_to_snowflake():
    print("=== MIGRATION: Sequential ID to 64-bit Snowflake ID ===")
    
    with engine.connect() as conn:
        # 1. Inspect existing users table
        col_info = conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id';"
        )).fetchall()
        print(f"Current users.id column type: {col_info}")
        
        # 2. Alter column to BIGINT if needed
        print("Ensuring users.id is BIGINT...")
        conn.execute(text("ALTER TABLE users ALTER COLUMN id TYPE BIGINT;"))
        # Drop default serial sequence if any exists on id so snowflake is default
        conn.execute(text("ALTER TABLE users ALTER COLUMN id DROP DEFAULT;"))
        conn.commit()
        print("Column altered successfully to BIGINT.")

    db = SessionLocal()
    try:
        users = db.query(User).all()
        print(f"Found {len(users)} users in database:")
        for u in users:
            old_id = u.id
            # If id is already a 64-bit snowflake (greater than 10^15 or bit length > 32)
            if u.id > 2**32:
                print(f"  User {u.email} already has Snowflake ID: {u.id}")
                continue
            new_id = get_snowflake_id()
            print(f"  Migrating {u.email} (Role: {u.role}): {old_id} -> {new_id} ({new_id.bit_length()} bits)")
            u.id = new_id
        
        db.commit()
        print("\nAll users successfully updated.")
        
        # Verify
        refreshed_users = db.query(User).all()
        print("\n=== Verified Users in Database ===")
        for u in refreshed_users:
            print(f"ID: {u.id} (bit length: {u.id.bit_length()}) | Email: {u.email} | Role: {u.role} | Hash starts with: {u.hashed_password[:10]}...")
            
    except Exception as e:
        db.rollback()
        print(f"Migration error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_users_to_snowflake()
