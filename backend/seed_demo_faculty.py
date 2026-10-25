"""
OptiSched - Seed Demo Faculty and Faculty-Subject Mappings.
Safe, idempotent, repeatable script to populate demo faculty and mappings.
Does not duplicate records when run repeatedly.
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, Base, engine
from app.models import Faculty, Subject, FacultySubject, CourseOffering, ClassSection

DEMO_FACULTY_DATA = [
    {
        "employee_id": "DEMO-FAC-001",
        "name": "Dr. Sarah Jenkins (Demo)",
        "email": "sarah.jenkins@optisched.demo",
        "department": "Computer Science",
    },
    {
        "employee_id": "DEMO-FAC-002",
        "name": "Prof. Rajesh Sharma (Demo)",
        "email": "rajesh.sharma@optisched.demo",
        "department": "Computer Science",
    },
    {
        "employee_id": "DEMO-FAC-003",
        "name": "Dr. Elena Rostova (Demo)",
        "email": "elena.rostova@optisched.demo",
        "department": "Computer Science",
    },
    {
        "employee_id": "DEMO-FAC-004",
        "name": "Dr. Michael Chen (Demo)",
        "email": "michael.chen@optisched.demo",
        "department": "Computer Science",
    },
    {
        "employee_id": "DEMO-FAC-005",
        "name": "Prof. Priya Nair (Demo)",
        "email": "priya.nair@optisched.demo",
        "department": "Computer Science",
    },
    {
        "employee_id": "DEMO-FAC-006",
        "name": "Dr. Vikram Patel (Demo)",
        "email": "vikram.patel@optisched.demo",
        "department": "Computer Science",
    },
]


def seed_demo_faculty():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("Checking/seeding demo faculty...")
        faculty_map = {}

        # 1. Ensure existing faculty (e.g. Arun Kumar) is included
        existing_faculty = db.query(Faculty).all()
        for f in existing_faculty:
            faculty_map[f.employee_id] = f

        # 2. Add or update clearly labeled demo faculty
        created_count = 0
        updated_count = 0
        for f_data in DEMO_FACULTY_DATA:
            fac = db.query(Faculty).filter(
                Faculty.employee_id == f_data["employee_id"]
            ).first()
            if not fac:
                # Check email uniqueness
                fac_by_email = db.query(Faculty).filter(
                    Faculty.email == f_data["email"]
                ).first()
                if fac_by_email:
                    fac = fac_by_email
                    fac.employee_id = f_data["employee_id"]
                    fac.name = f_data["name"]
                    fac.department = f_data["department"]
                    fac.is_active = True
                    updated_count += 1
                else:
                    fac = Faculty(
                        employee_id=f_data["employee_id"],
                        name=f_data["name"],
                        email=f_data["email"],
                        department=f_data["department"],
                        is_active=True,
                    )
                    db.add(fac)
                    created_count += 1
            else:
                fac.name = f_data["name"]
                fac.department = f_data["department"]
                fac.is_active = True
                updated_count += 1

            db.flush()
            faculty_map[f_data["employee_id"]] = fac

        db.commit()
        print(f"Demo faculty: {created_count} created, {updated_count} verified/updated.")

        # 3. Create Faculty-Subject eligibility mappings
        subjects = db.query(Subject).order_by(Subject.id).all()
        all_active_faculty = db.query(Faculty).filter(Faculty.is_active.is_(True)).order_by(Faculty.id).all()

        if not all_active_faculty:
            print("No active faculty found.")
            return

        print(f"Mapping {len(subjects)} subjects across {len(all_active_faculty)} active faculty members...")
        fs_created = 0
        fs_existing = 0

        # Map each subject to 1-2 qualified faculty members deterministically
        for idx, subj in enumerate(subjects):
            primary_fac = all_active_faculty[idx % len(all_active_faculty)]
            secondary_fac = all_active_faculty[(idx + 1) % len(all_active_faculty)]

            for fac in [primary_fac, secondary_fac]:
                existing_map = db.query(FacultySubject).filter(
                    FacultySubject.faculty_id == fac.id,
                    FacultySubject.subject_id == subj.id,
                ).first()

                if not existing_map:
                    fs = FacultySubject(
                        faculty_id=fac.id,
                        subject_id=subj.id,
                    )
                    db.add(fs)
                    fs_created += 1
                else:
                    fs_existing += 1

        db.commit()
        print(f"FacultySubject mappings: {fs_created} created, {fs_existing} existing verified.")

        # 4. Distribute Course Offerings to qualified faculty
        offerings = db.query(CourseOffering).all()
        reassigned_count = 0
        for off in offerings:
            # Check qualified faculty for this offering's subject
            qualified = db.query(FacultySubject).filter(
                FacultySubject.subject_id == off.subject_id
            ).all()
            if qualified:
                qualified_ids = [q.faculty_id for q in qualified]
                # If current faculty is not in qualified or if we want diverse distribution
                if off.faculty_id not in qualified_ids:
                    off.faculty_id = qualified_ids[0]
                    reassigned_count += 1
                else:
                    # Distribute across classes so section offerings aren't all on 1 instructor
                    target_fac = qualified_ids[off.class_id % len(qualified_ids)]
                    if off.faculty_id != target_fac:
                        off.faculty_id = target_fac
                        reassigned_count += 1

        db.commit()
        print(f"CourseOfferings: {reassigned_count} reassigned to qualified faculty.")
        print("Demo faculty seed completed successfully.")

    except Exception as exc:
        db.rollback()
        print(f"Error during seeding: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_faculty()
