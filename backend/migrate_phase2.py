"""
OptiSched Phase 2 Database Migration
- Adds `student_count` column to `classes` table if not already present.
- Creates `faculty_availability` table for faculty availability & blackout intervals.
- Creates `published_timetables` table for persistent schedule versioning.
- Creates `published_timetable_entries` table for published session records.
Idempotent and safe: runs on PostgreSQL and SQLite without data loss.
"""

import os
import sys
from pathlib import Path

# Setup paths
sys.path.insert(0, os.path.abspath("backend"))
venv_site = Path("backend/.venv/Lib/site-packages").resolve()
if venv_site.exists() and str(venv_site) not in sys.path:
    sys.path.append(str(venv_site))

from sqlalchemy import inspect, text
from app.db.session import engine, Base
import app.models  # Ensures all models are registered with Base.metadata


def run_migration():
    print("================================================================")
    print("    OptiSched Phase 2 Database Migration                        ")
    print("================================================================")

    dialect_name = engine.dialect.name
    print(f"[DIALECT] Connected to database dialect: {dialect_name}")

    with engine.connect() as conn:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        print(f"[TABLES] Found existing tables: {', '.join(existing_tables)}")

        # 1. Classes table: check student_count column
        if "classes" in existing_tables:
            columns = [col["name"] for col in inspector.get_columns("classes")]
            if "student_count" not in columns:
                print("[MIGRATE] Adding 'student_count' column to 'classes' table...")
                conn.execute(text("ALTER TABLE classes ADD COLUMN student_count INTEGER DEFAULT 60 NOT NULL;"))
                conn.commit()
                print("[MIGRATE] Successfully added 'student_count' column.")
            else:
                print("[INFO] 'student_count' column already exists in 'classes' table.")
        else:
            print("[INFO] 'classes' table does not exist yet; will be created by metadata.create_all.")

        # 2. Create newly introduced tables using metadata
        print("[MIGRATE] Ensuring all new Phase 2 tables are created...")
        Base.metadata.create_all(bind=engine)
        conn.commit()

        # 3. Verify newly created tables
        inspector = inspect(engine)
        updated_tables = inspector.get_table_names()
        required_tables = ["faculty_availability", "published_timetables", "published_timetable_entries"]
        for tbl in required_tables:
            if tbl in updated_tables:
                print(f"[VERIFIED] Table '{tbl}' is present.")
            else:
                print(f"[WARNING] Table '{tbl}' was not detected.")

    print("================================================================")
    print("    Phase 2 Migration Completed Successfully!                   ")
    print("================================================================")


if __name__ == "__main__":
    run_migration()
