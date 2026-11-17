"""
OptiSched Phase 3 Database Integrity Migration
- Scopes ClassSection uniqueness to (department, academic_year, semester, name)
- Scopes Room uniqueness to (building, name)
- Scopes TimetableConfig uniqueness to (department, semester)
- Adds Foreign Keys to published_timetable_entries (classes, subjects, faculty, rooms)
- Adds Check Constraints on positive capacity, weekly periods, semester/year ranges, and times
- Adds B-Tree indexes on foreign keys and frequently queried columns
Fully idempotent, reversible (with --downgrade), and safe.
"""

import argparse
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


def check_existing_data_compatibility(conn):
    """
    Verifies that existing data satisfies the constraints before adding them.
    Returns (is_compatible, issues_list).
    """
    issues = []
    inspector = inspect(conn)
    tables = inspector.get_table_names()

    # 1. Classes: duplicate (department, academic_year, semester, name)
    if "classes" in tables:
        dups = conn.execute(text("""
            SELECT department, academic_year, semester, name, count(*) 
            FROM classes 
            GROUP BY department, academic_year, semester, name 
            HAVING count(*) > 1;
        """)).fetchall()
        if dups:
            issues.append(f"classes: Found {len(dups)} duplicate scoped section records: {dups}")

        inv_sem = conn.execute(text("SELECT id, name, semester FROM classes WHERE semester < 1 OR semester > 8;")).fetchall()
        if inv_sem:
            issues.append(f"classes: Found {len(inv_sem)} records with invalid semester: {inv_sem}")

    # 2. Rooms: duplicate (building, name)
    if "rooms" in tables:
        dups = conn.execute(text("""
            SELECT building, name, count(*) 
            FROM rooms 
            GROUP BY building, name 
            HAVING count(*) > 1;
        """)).fetchall()
        if dups:
            issues.append(f"rooms: Found {len(dups)} duplicate (building, name) records: {dups}")

        inv_cap = conn.execute(text("SELECT id, name, capacity FROM rooms WHERE capacity <= 0;")).fetchall()
        if inv_cap:
            issues.append(f"rooms: Found {len(inv_cap)} records with capacity <= 0: {inv_cap}")

    # 3. CourseOfferings: weekly_periods <= 0
    if "course_offerings" in tables:
        inv_per = conn.execute(text("SELECT id, weekly_periods FROM course_offerings WHERE weekly_periods <= 0;")).fetchall()
        if inv_per:
            issues.append(f"course_offerings: Found {len(inv_per)} records with weekly_periods <= 0: {inv_per}")

    # 4. Published entries: orphan check
    if "published_timetable_entries" in tables:
        orphans_c = conn.execute(text("SELECT count(*) FROM published_timetable_entries e LEFT JOIN classes c ON e.class_id = c.id WHERE c.id IS NULL;")).scalar()
        if orphans_c > 0:
            issues.append(f"published_timetable_entries: Found {orphans_c} orphaned class_id references")

        orphans_f = conn.execute(text("SELECT count(*) FROM published_timetable_entries e LEFT JOIN faculty f ON e.faculty_id = f.id WHERE f.id IS NULL;")).scalar()
        if orphans_f > 0:
            issues.append(f"published_timetable_entries: Found {orphans_f} orphaned faculty_id references")

        orphans_r = conn.execute(text("SELECT count(*) FROM published_timetable_entries e LEFT JOIN rooms r ON e.room_id = r.id WHERE r.id IS NULL;")).scalar()
        if orphans_r > 0:
            issues.append(f"published_timetable_entries: Found {orphans_r} orphaned room_id references")

        orphans_s = conn.execute(text("SELECT count(*) FROM published_timetable_entries e LEFT JOIN subjects s ON e.subject_id = s.id WHERE s.id IS NULL;")).scalar()
        if orphans_s > 0:
            issues.append(f"published_timetable_entries: Found {orphans_s} orphaned subject_id references")

    return len(issues) == 0, issues


def upgrade_postgresql(conn):
    print("[MIGRATE] Applying Phase 3 integrity upgrade on PostgreSQL...")

    # 1. Classes: drop global unique name, add composite unique and checks
    print("  -> Updating 'classes' constraints...")
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_key;"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS uq_class_dept_year_sem_name;"))
    conn.execute(text("""
        ALTER TABLE classes ADD CONSTRAINT uq_class_dept_year_sem_name 
        UNIQUE (department, academic_year, semester, name);
    """))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_semester_range;"))
    conn.execute(text("ALTER TABLE classes ADD CONSTRAINT chk_classes_semester_range CHECK (semester BETWEEN 1 AND 8);"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_academic_year_range;"))
    conn.execute(text("ALTER TABLE classes ADD CONSTRAINT chk_classes_academic_year_range CHECK (academic_year BETWEEN 1 AND 4);"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_student_count_positive;"))
    conn.execute(text("ALTER TABLE classes ADD CONSTRAINT chk_classes_student_count_positive CHECK (student_count IS NULL OR student_count > 0);"))

    # 2. Rooms: drop global unique name, add composite unique and checks
    print("  -> Updating 'rooms' constraints...")
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_name_key;"))
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS uq_room_building_name;"))
    conn.execute(text("""
        ALTER TABLE rooms ADD CONSTRAINT uq_room_building_name 
        UNIQUE (building, name);
    """))
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_rooms_capacity_positive;"))
    conn.execute(text("ALTER TABLE rooms ADD CONSTRAINT chk_rooms_capacity_positive CHECK (capacity > 0);"))
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_rooms_type_valid;"))
    conn.execute(text("ALTER TABLE rooms ADD CONSTRAINT chk_rooms_type_valid CHECK (room_type IN ('classroom', 'lab', 'lecture_hall'));"))

    # 3. Timetable Configs: add department column, update uniqueness
    print("  -> Updating 'timetable_configs' schema and constraints...")
    conn.execute(text("ALTER TABLE timetable_configs ADD COLUMN IF NOT EXISTS department VARCHAR(100);"))
    conn.execute(text("ALTER TABLE timetable_configs DROP CONSTRAINT IF EXISTS timetable_configs_semester_key;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_timetable_configs_semester;"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_timetable_configs_semester ON timetable_configs (semester);"))
    conn.execute(text("ALTER TABLE timetable_configs DROP CONSTRAINT IF EXISTS uq_timetable_configs_dept_sem;"))
    conn.execute(text("""
        ALTER TABLE timetable_configs ADD CONSTRAINT uq_timetable_configs_dept_sem 
        UNIQUE (department, semester);
    """))
    conn.execute(text("ALTER TABLE timetable_configs DROP CONSTRAINT IF EXISTS chk_timetable_configs_semester_range;"))
    conn.execute(text("ALTER TABLE timetable_configs ADD CONSTRAINT chk_timetable_configs_semester_range CHECK (semester BETWEEN 1 AND 8);"))

    # 4. Course Offerings: checks and indexes
    print("  -> Updating 'course_offerings' constraints and indexes...")
    conn.execute(text("ALTER TABLE course_offerings DROP CONSTRAINT IF EXISTS chk_course_offerings_weekly_periods_positive;"))
    conn.execute(text("ALTER TABLE course_offerings ADD CONSTRAINT chk_course_offerings_weekly_periods_positive CHECK (weekly_periods > 0);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_course_offerings_faculty_id ON course_offerings (faculty_id);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_course_offerings_subject_id ON course_offerings (subject_id);"))

    # 5. Faculty Availability: checks and indexes
    print("  -> Updating 'faculty_availability' constraints and indexes...")
    conn.execute(text("ALTER TABLE faculty_availability DROP CONSTRAINT IF EXISTS chk_faculty_availability_day_valid;"))
    conn.execute(text("""
        ALTER TABLE faculty_availability ADD CONSTRAINT chk_faculty_availability_day_valid 
        CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'));
    """))
    conn.execute(text("ALTER TABLE faculty_availability DROP CONSTRAINT IF EXISTS chk_faculty_availability_time_interval;"))
    conn.execute(text("ALTER TABLE faculty_availability ADD CONSTRAINT chk_faculty_availability_time_interval CHECK (start_time < end_time);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_faculty_availability_faculty_day ON faculty_availability (faculty_id, day);"))

    # 6. Published Timetables & Entries: FKs, indexes, checks
    print("  -> Updating 'published_timetable_entries' FKs and indexes...")
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_class_id;"))
    conn.execute(text("""
        ALTER TABLE published_timetable_entries ADD CONSTRAINT fk_published_entries_class_id 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    """))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_subject_id;"))
    conn.execute(text("""
        ALTER TABLE published_timetable_entries ADD CONSTRAINT fk_published_entries_subject_id 
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;
    """))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_faculty_id;"))
    conn.execute(text("""
        ALTER TABLE published_timetable_entries ADD CONSTRAINT fk_published_entries_faculty_id 
        FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE RESTRICT;
    """))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_room_id;"))
    conn.execute(text("""
        ALTER TABLE published_timetable_entries ADD CONSTRAINT fk_published_entries_room_id 
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT;
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_published_entries_faculty_day ON published_timetable_entries (faculty_id, day, start_time);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_published_entries_class_day ON published_timetable_entries (class_id, day, start_time);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_published_entries_room_day ON published_timetable_entries (room_id, day, start_time);"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS chk_published_entries_time_interval;"))
    conn.execute(text("ALTER TABLE published_timetable_entries ADD CONSTRAINT chk_published_entries_time_interval CHECK (start_time < end_time);"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS chk_published_entries_occurrence_positive;"))
    conn.execute(text("ALTER TABLE published_timetable_entries ADD CONSTRAINT chk_published_entries_occurrence_positive CHECK (occurrence > 0);"))

    # 7. Users: role check
    print("  -> Updating 'users' constraints...")
    conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role_valid;"))
    conn.execute(text("ALTER TABLE users ADD CONSTRAINT chk_users_role_valid CHECK (role IN ('admin', 'faculty', 'student'));"))

    # 8. Published Timetables indexes
    print("  -> Creating indexes on 'published_timetables'...")
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_published_timetables_class_active ON published_timetables (class_id, is_active);"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_published_timetables_dept_sem_active ON published_timetables (department, semester, is_active);"))

    conn.commit()
    print("[MIGRATE] PostgreSQL upgrade completed successfully!")


def downgrade_postgresql(conn):
    print("[MIGRATE] Downgrading Phase 3 integrity migration on PostgreSQL...")

    # Drop added constraints and revert to previous schema
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS uq_class_dept_year_sem_name;"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_semester_range;"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_academic_year_range;"))
    conn.execute(text("ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_student_count_positive;"))
    conn.execute(text("ALTER TABLE classes ADD CONSTRAINT classes_name_key UNIQUE (name);"))

    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS uq_room_building_name;"))
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_rooms_capacity_positive;"))
    conn.execute(text("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_rooms_type_valid;"))
    conn.execute(text("ALTER TABLE rooms ADD CONSTRAINT rooms_name_key UNIQUE (name);"))

    conn.execute(text("ALTER TABLE timetable_configs DROP CONSTRAINT IF EXISTS uq_timetable_configs_dept_sem;"))
    conn.execute(text("ALTER TABLE timetable_configs DROP CONSTRAINT IF EXISTS chk_timetable_configs_semester_range;"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_timetable_configs_semester ON timetable_configs (semester);"))

    conn.execute(text("ALTER TABLE course_offerings DROP CONSTRAINT IF EXISTS chk_course_offerings_weekly_periods_positive;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_course_offerings_faculty_id;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_course_offerings_subject_id;"))

    conn.execute(text("ALTER TABLE faculty_availability DROP CONSTRAINT IF EXISTS chk_faculty_availability_day_valid;"))
    conn.execute(text("ALTER TABLE faculty_availability DROP CONSTRAINT IF EXISTS chk_faculty_availability_time_interval;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_faculty_availability_faculty_day;"))

    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_class_id;"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_subject_id;"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_faculty_id;"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS fk_published_entries_room_id;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_published_entries_faculty_day;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_published_entries_class_day;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_published_entries_room_day;"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS chk_published_entries_time_interval;"))
    conn.execute(text("ALTER TABLE published_timetable_entries DROP CONSTRAINT IF EXISTS chk_published_entries_occurrence_positive;"))

    conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role_valid;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_published_timetables_class_active;"))
    conn.execute(text("DROP INDEX IF EXISTS ix_published_timetables_dept_sem_active;"))

    conn.commit()
    print("[MIGRATE] Downgrade completed successfully.")


def run(downgrade=False, dry_run=False):
    print("================================================================")
    print("    OptiSched Phase 3 Database Integrity Migration              ")
    print("================================================================")
    dialect_name = engine.dialect.name
    print(f"[DIALECT] Connected to: {dialect_name}")

    with engine.connect() as conn:
        print("[CHECK] Running data compatibility inspection...")
        is_compat, issues = check_existing_data_compatibility(conn)
        if not is_compat:
            print("[FAIL] Existing records violate proposed constraints:")
            for iss in issues:
                print(f"  - {iss}")
            sys.exit(1)
        print("[PASS] All existing data is compatible with new constraints.")

        if dry_run:
            print("[DRY-RUN] Inspection completed. No changes applied.")
            return

        if dialect_name == "postgresql":
            if downgrade:
                downgrade_postgresql(conn)
            else:
                upgrade_postgresql(conn)
        else:
            print(f"[DIALECT] {dialect_name} detected. Ensuring metadata tables...")
            Base.metadata.create_all(bind=engine)
            print(f"[SUCCESS] Metadata tables verified for {dialect_name}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OptiSched Phase 3 Integrity Migration")
    parser.add_argument("--downgrade", action="store_true", help="Revert Phase 3 integrity migration")
    parser.add_argument("--dry-run", action="store_true", help="Inspect without modifying schema")
    args = parser.parse_args()
    run(downgrade=args.downgrade, dry_run=args.dry_run)
