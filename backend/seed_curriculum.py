
from app.db.session import Base, engine, SessionLocal
from app.models import Faculty, ClassSection, Subject, Room, CourseOffering

DEPARTMENT = "Computer Science"
PROGRAM_PREFIX = "CSE-CC"
ACADEMIC_YEAR_LABEL = "2026-27"

# Representative demo courses. Verify names, codes, semester placement, period
# counts, and lab requirements against the current official curriculum.
CURRICULUM = {
    1: [
        ("CC101", "Foundations of Computing", 3, False),
        ("MA101", "Engineering Mathematics I", 4, False),
        ("PH101", "Engineering Physics I", 3, False),
        ("CC102L", "Foundations of Computing Lab", 2, True),
        ("PH101L", "Engineering Physics Laboratory", 2, True),
    ],
    2: [
        ("2BS1404", "Engineering Mathematics-II", 4, False),
        ("2OT1803", "Linguistic Skills", 2, False),
        ("2OT1804", "Analytical Skills-I", 2, False),
        ("PBS1402", "Fundamental Physics", 3, False),
        ("PBS1403", "Biology", 2, False),
        ("PCS1001", "Joy of Computing", 3, False),
        ("PME1001", "Product Design and Realization", 2, False),
    ],
    3: [
        ("CC201", "Data Structures and Algorithms", 4, False),
        ("CC202", "Object-Oriented Programming", 3, False),
        ("CC203", "Discrete Mathematics", 3, False),
        ("CC204", "Digital Logic Design", 3, False),
        ("CC201L", "Data Structures and Algorithms Lab", 2, True),
    ],
    4: [
        ("CC301", "Database Management Systems", 3, False),
        ("CC302", "Operating Systems", 3, False),
        ("CC303", "Computer Networks", 3, False),
        ("CC304", "Probability and Statistics", 3, False),
        ("CC301L", "Database Management Systems Lab", 2, True),
    ],
    5: [
        ("5CS1027", "Cloud Applications Development and Deployment", 1, False),
        ("5CS1990", "Design Project-I", 2, False),
        ("5CS1056", "Foundations of Data Analytics", 2, False),
        ("5CS1284", "Kubernetes for DevOps Engineer", 2, False),
        ("CC501L", "Cloud Applications Development Lab", 4, True),
    ],
    6: [
        ("CC601", "Cloud Architecture and Services", 3, False),
        ("CC602", "Distributed Systems", 3, False),
        ("CC603", "Cloud Security", 3, False),
        ("CC604", "DevOps and CI/CD", 3, False),
        ("CC601L", "Cloud and DevOps Lab", 2, True),
    ],
    7: [
        ("CC701", "Advanced Cloud Computing", 3, False),
        ("CC702", "Infrastructure as Code", 3, False),
        ("CC703", "Cloud Native Application Engineering", 3, False),
        ("CC704", "Industry Project", 2, False),
        ("CC701L", "Cloud Native Engineering Lab", 2, True),
    ],
    # Semester 8 is intentionally synthetic for internship/elective testing.
    8: [
        ("CC801", "Cloud Computing Elective", 3, False),
        ("CC802", "Advanced DevOps Elective", 3, False),
        ("CC803", "Capstone Project", 2, False),
        ("CC804", "Industry Internship", 2, False),
    ],
}


def get_or_create_faculty(db):
    faculty = (
        db.query(Faculty)
        .filter(Faculty.is_active.is_(True))
        .order_by(Faculty.id)
        .all()
    )
    if not faculty:
        # A clearly labelled demo instructor is created only if the database has
        # no active faculty. Replace with actual faculty records before use.
        demo = Faculty(
            employee_id="DEMO-FAC-001",
            name="Demo Faculty",
            email="demo.faculty@optisched.local",
            department=DEPARTMENT,
        )
        db.add(demo)
        db.flush()
        faculty = [demo]
    return faculty


def get_or_create_room(db, name, room_type, capacity):
    room = db.query(Room).filter(Room.name == name).first()
    if room:
        return room
    room = Room(
        name=name,
        room_type=room_type,
        capacity=capacity,
        building="Block A",
    )
    db.add(room)
    db.flush()
    return room


def main():
    # Ensure SQLAlchemy model tables exist before seeding.
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        faculty = get_or_create_faculty(db)

        # Create/reuse demo rooms; real rooms already in the database are retained.
        get_or_create_room(db, "CR101", "classroom", 60)
        get_or_create_room(db, "LAB101", "lab", 40)
        get_or_create_room(db, "CR102", "classroom", 60)
        db.flush()

        sections = {}
        for semester in range(1, 9):
            name = f"{PROGRAM_PREFIX}-S{semester}-A"
            section = db.query(ClassSection).filter(ClassSection.name == name).first()

            # Reuse the existing first-semester demo section if present.
            if section is None and semester == 1:
                section = (
                    db.query(ClassSection)
                    .filter(ClassSection.name == "CSE-S1-A")
                    .first()
                )

            if section is None:
                section = ClassSection(
                    name=name,
                    department=DEPARTMENT,
                    academic_year=(semester + 1) // 2,
                    semester=semester,
                    is_active=True,
                )
                db.add(section)
                db.flush()
            else:
                # Keep existing section identity and only correct its semester metadata.
                section.semester = semester
                section.academic_year = (semester + 1) // 2
                section.department = DEPARTMENT
                section.is_active = True

            sections[semester] = section

        created_subjects = 0
        created_offerings = 0
        skipped_offerings = 0
        offering_counter = 0

        for semester, courses in CURRICULUM.items():
            section = sections[semester]
            for code, name, weekly_periods, requires_lab in courses:
                subject = db.query(Subject).filter(Subject.code == code).first()
                if subject is None:
                    subject = Subject(
                        code=code,
                        name=name,
                        department=DEPARTMENT,
                    )
                    db.add(subject)
                    db.flush()
                    created_subjects += 1

                existing = (
                    db.query(CourseOffering)
                    .filter(
                        CourseOffering.class_id == section.id,
                        CourseOffering.subject_id == subject.id,
                    )
                    .first()
                )
                if existing:
                    skipped_offerings += 1
                    continue

                instructor = faculty[offering_counter % len(faculty)]
                offering_counter += 1
                offering = CourseOffering(
                    class_id=section.id,
                    subject_id=subject.id,
                    faculty_id=instructor.id,
                    weekly_periods=weekly_periods,
                    requires_lab=requires_lab,
                )
                db.add(offering)
                created_offerings += 1

        db.commit()

        total_sections = db.query(ClassSection).filter(
            ClassSection.name.like(f"{PROGRAM_PREFIX}-S%-A")
        ).count()
        total_subjects = db.query(Subject).count()
        total_offerings = db.query(CourseOffering).count()

        print("\nOptiSched curriculum seed completed.")
        print(f"Sections created/reused for semesters 1-8: {len(sections)}")
        print(f"New subjects inserted: {created_subjects}")
        print(f"New course offerings inserted: {created_offerings}")
        print(f"Existing offerings skipped: {skipped_offerings}")
        print(f"Total subjects currently in database: {total_subjects}")
        print(f"Total course offerings currently in database: {total_offerings}")
        print("\nReview the curriculum and faculty assignments before treating them as official.")
        print("Use GET /api/sections and GET /api/course-offerings to verify the seed.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
