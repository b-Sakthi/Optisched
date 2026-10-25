"""
OptiSched - Seed 33 Additional Realistic Sample Faculty Records.
Expands faculty pool from 7 to 40 members without '(Demo)' in names.
Preserves existing 7 faculty and all current course offerings.
Safe and idempotent: runs repeatedly without creating duplicates.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, Base, engine
from app.models import Faculty, Subject, FacultySubject, CourseOffering

ADDITIONAL_33_FACULTY = [
    # Foundations & Core CS
    {"employee_id": "FAC-CS-007", "name": "Dr. Alice Martin", "email": "alice.martin@optisched.academic.local", "department": "Computer Science", "domain": "Foundations & Core CS"},
    {"employee_id": "FAC-CS-008", "name": "Prof. Benjamin Hayes", "email": "benjamin.hayes@optisched.academic.local", "department": "Computer Science", "domain": "Foundations & Core CS"},
    {"employee_id": "FAC-CS-009", "name": "Dr. Clara Zhang", "email": "clara.zhang@optisched.academic.local", "department": "Computer Science", "domain": "Foundations & Core CS"},
    {"employee_id": "FAC-CS-010", "name": "Prof. Daniel Kowalski", "email": "daniel.kowalski@optisched.academic.local", "department": "Computer Science", "domain": "Foundations & Core CS"},
    {"employee_id": "FAC-CS-011", "name": "Dr. Evelyn Vance", "email": "evelyn.vance@optisched.academic.local", "department": "Computer Science", "domain": "Foundations & Core CS"},
    # Mathematics & Theory
    {"employee_id": "FAC-CS-012", "name": "Prof. Farhan Siddiqui", "email": "farhan.siddiqui@optisched.academic.local", "department": "Computer Science", "domain": "Mathematics & Theory"},
    {"employee_id": "FAC-CS-013", "name": "Dr. Grace Hopper-Smith", "email": "grace.smith@optisched.academic.local", "department": "Computer Science", "domain": "Mathematics & Theory"},
    {"employee_id": "FAC-CS-014", "name": "Prof. Haruto Takahashi", "email": "haruto.takahashi@optisched.academic.local", "department": "Computer Science", "domain": "Mathematics & Theory"},
    {"employee_id": "FAC-CS-015", "name": "Dr. Ingrid Bergman", "email": "ingrid.bergman@optisched.academic.local", "department": "Computer Science", "domain": "Mathematics & Theory"},
    {"employee_id": "FAC-CS-016", "name": "Prof. Julian Thorne", "email": "julian.thorne@optisched.academic.local", "department": "Computer Science", "domain": "Mathematics & Theory"},
    # Physics & Applied Engineering
    {"employee_id": "FAC-CS-017", "name": "Dr. Kavita Raman", "email": "kavita.raman@optisched.academic.local", "department": "Computer Science", "domain": "Physics & Applied Eng."},
    {"employee_id": "FAC-CS-018", "name": "Prof. Liam O'Connor", "email": "liam.oconnor@optisched.academic.local", "department": "Computer Science", "domain": "Physics & Applied Eng."},
    {"employee_id": "FAC-CS-019", "name": "Dr. Maya Lin", "email": "maya.lin@optisched.academic.local", "department": "Computer Science", "domain": "Physics & Applied Eng."},
    {"employee_id": "FAC-CS-020", "name": "Prof. Nikolai Volkov", "email": "nikolai.volkov@optisched.academic.local", "department": "Computer Science", "domain": "Physics & Applied Eng."},
    # Communication & Projects
    {"employee_id": "FAC-CS-021", "name": "Dr. Olivia Bennett", "email": "olivia.bennett@optisched.academic.local", "department": "Computer Science", "domain": "Communication & Projects"},
    {"employee_id": "FAC-CS-022", "name": "Prof. Peter Adebayo", "email": "peter.adebayo@optisched.academic.local", "department": "Computer Science", "domain": "Communication & Projects"},
    {"employee_id": "FAC-CS-023", "name": "Dr. Qian Wei", "email": "qian.wei@optisched.academic.local", "department": "Computer Science", "domain": "Communication & Projects"},
    {"employee_id": "FAC-CS-024", "name": "Prof. Rafael Silva", "email": "rafael.silva@optisched.academic.local", "department": "Computer Science", "domain": "Communication & Projects"},
    # Systems & Architecture
    {"employee_id": "FAC-CS-025", "name": "Dr. Samantha Reed", "email": "samantha.reed@optisched.academic.local", "department": "Computer Science", "domain": "Systems & Architecture"},
    {"employee_id": "FAC-CS-026", "name": "Prof. Tariq Al-Mansoor", "email": "tariq.almansoor@optisched.academic.local", "department": "Computer Science", "domain": "Systems & Architecture"},
    {"employee_id": "FAC-CS-027", "name": "Dr. Uma Chandrasekaran", "email": "uma.chandrasekaran@optisched.academic.local", "department": "Computer Science", "domain": "Systems & Architecture"},
    {"employee_id": "FAC-CS-028", "name": "Prof. Vincent Dubois", "email": "vincent.dubois@optisched.academic.local", "department": "Computer Science", "domain": "Systems & Architecture"},
    {"employee_id": "FAC-CS-029", "name": "Dr. Wendy Taylor", "email": "wendy.taylor@optisched.academic.local", "department": "Computer Science", "domain": "Systems & Architecture"},
    # Databases & Analytics
    {"employee_id": "FAC-CS-030", "name": "Prof. Xavier Morales", "email": "xavier.morales@optisched.academic.local", "department": "Computer Science", "domain": "Databases & Analytics"},
    {"employee_id": "FAC-CS-031", "name": "Dr. Yasmin Farooq", "email": "yasmin.farooq@optisched.academic.local", "department": "Computer Science", "domain": "Databases & Analytics"},
    {"employee_id": "FAC-CS-032", "name": "Prof. Zachary King", "email": "zachary.king@optisched.academic.local", "department": "Computer Science", "domain": "Databases & Analytics"},
    {"employee_id": "FAC-CS-033", "name": "Dr. Amara Okafor", "email": "amara.okafor@optisched.academic.local", "department": "Computer Science", "domain": "Databases & Analytics"},
    {"employee_id": "FAC-CS-034", "name": "Prof. Brian Fletcher", "email": "brian.fletcher@optisched.academic.local", "department": "Computer Science", "domain": "Databases & Analytics"},
    # Cloud, DevOps & Infrastructure
    {"employee_id": "FAC-CS-035", "name": "Dr. Chloe Dupont", "email": "chloe.dupont@optisched.academic.local", "department": "Computer Science", "domain": "Cloud, DevOps & Infra"},
    {"employee_id": "FAC-CS-036", "name": "Prof. David Lindqvist", "email": "david.lindqvist@optisched.academic.local", "department": "Computer Science", "domain": "Cloud, DevOps & Infra"},
    {"employee_id": "FAC-CS-037", "name": "Dr. Esther Mwangi", "email": "esther.mwangi@optisched.academic.local", "department": "Computer Science", "domain": "Cloud, DevOps & Infra"},
    {"employee_id": "FAC-CS-038", "name": "Prof. Felix Baumgartner", "email": "felix.baumgartner@optisched.academic.local", "department": "Computer Science", "domain": "Cloud, DevOps & Infra"},
    {"employee_id": "FAC-CS-039", "name": "Dr. Gina Rossi", "email": "gina.rossi@optisched.academic.local", "department": "Computer Science", "domain": "Cloud, DevOps & Infra"},
]

DOMAIN_SUBJECT_CODES = {
    "Foundations & Core CS": ["CS101", "CC101", "CC102L", "PCS1001", "CC201", "CC202", "CC201L"],
    "Mathematics & Theory": ["MA101", "2BS1404", "2OT1804", "CC203", "CC304"],
    "Physics & Applied Eng.": ["PH101", "PH101L", "PBS1402", "PME1001"],
    "Communication & Projects": ["2OT1803", "PBS1403", "5CS1990", "CC704", "CC803", "CC804"],
    "Systems & Architecture": ["CC204", "CC302", "CC303", "CC602"],
    "Databases & Analytics": ["CC301", "CC301L", "5CS1056"],
    "Cloud, DevOps & Infra": ["5CS1027", "5CS1284", "CC501L", "CC601", "CC603", "CC604", "CC601L", "CC701", "CC702", "CC703", "CC701L", "CC801", "CC802"],
}


def seed_40_faculty():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print("Checking and seeding 33 additional sample faculty...")
        created_count = 0
        existing_count = 0

        # Also clean up any legacy "(Demo)" suffix from faculty names in the database
        existing_faculty = db.query(Faculty).all()
        for f in existing_faculty:
            if f.name.endswith(" (Demo)"):
                f.name = f.name.replace(" (Demo)", "").strip()
        db.commit()

        # Seed the 33 additional members
        created_faculty_records = []
        for f_data in ADDITIONAL_33_FACULTY:
            fac = db.query(Faculty).filter(Faculty.employee_id == f_data["employee_id"]).first()
            if not fac:
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
                existing_count += 1
            db.flush()
            created_faculty_records.append((fac, f_data["domain"]))

        db.commit()
        print(f"Sample faculty: {created_count} created, {existing_count} verified.")

        # Map qualifications
        subjects_by_code = {s.code: s for s in db.query(Subject).all()}
        mappings_created = 0

        for fac, domain in created_faculty_records:
            target_codes = DOMAIN_SUBJECT_CODES.get(domain, [])
            for code in target_codes:
                if code in subjects_by_code:
                    subj = subjects_by_code[code]
                    exists = db.query(FacultySubject).filter(
                        FacultySubject.faculty_id == fac.id,
                        FacultySubject.subject_id == subj.id,
                    ).first()
                    if not exists:
                        mapping = FacultySubject(faculty_id=fac.id, subject_id=subj.id)
                        db.add(mapping)
                        mappings_created += 1

        db.commit()
        print(f"New faculty qualifications created: {mappings_created}")

        total_faculty = db.query(Faculty).count()
        total_mappings = db.query(FacultySubject).count()
        print(f"Total faculty currently in database: {total_faculty} (Expected: 40)")
        print(f"Total faculty-subject qualification mappings in database: {total_mappings}")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_40_faculty()
