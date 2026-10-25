from datetime import datetime
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from ortools.sat.python import cp_model

from app.db.session import Base, engine, check_database_connection, SessionLocal
from app.models import (
    Faculty,
    ClassSection,
    Subject,
    Room,
    CourseOffering,
    TimetableConfig,
    FacultySubject,
)
from app.core.auth import get_current_user


# -------------------- Request Schemas --------------------
class FacultyCreate(BaseModel):
    employee_id: str
    name: str
    email: EmailStr
    department: str


class FacultyUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    department: str | None = None
    is_active: bool | None = None


class SectionCreate(BaseModel):
    name: str
    department: str
    academic_year: int
    semester: int


class SubjectCreate(BaseModel):
    code: str
    name: str
    department: str


class RoomCreate(BaseModel):
    name: str
    room_type: str
    capacity: int
    building: str | None = None


class CourseOfferingCreate(BaseModel):
    class_id: int
    subject_id: int
    faculty_id: int
    weekly_periods: int = Field(ge=1, le=35)
    requires_lab: bool = False


# -------------------- Timetable Request Schemas --------------------
VALID_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


class TimeSlot(BaseModel):
    name: str
    start_time: str
    end_time: str


class BreakItem(BaseModel):
    name: str
    start_time: str
    end_time: str
    duration: int | None = None
    is_lunch: bool = False


class DaySchedule(BaseModel):
    day: str
    is_half_day: bool = False
    slots: list[TimeSlot] = Field(min_length=1, max_length=12)


class TimetableConfigSave(BaseModel):
    days: list[DaySchedule] = Field(min_length=1, max_length=7)
    working_hours_start: str | None = None
    working_hours_end: str | None = None
    period_duration: int | None = Field(default=None, ge=15, le=180)
    transition_duration: int | None = Field(default=None, ge=0, le=60)
    breaks: list[BreakItem] | None = None
    lunch_break: BreakItem | None = None
    is_active: bool = True


class TimetableGenerateRequest(BaseModel):
    scope: Literal["class", "section", "semester", "department", "university"] = "class"
    class_id: int | None = None
    department: str | None = None
    semester: int | None = Field(default=None, ge=1, le=8)
    days: list[DaySchedule] | None = None
    max_time_seconds: int = Field(default=10, ge=1, le=60)


# -------------------- FastAPI Application --------------------
app = FastAPI(
    title="OptiSched API",
    description="Academic timetable management and optimization API",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- Database Setup --------------------
@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------- Home and Health APIs --------------------
@app.get("/")
def home():
    return {"message": "Welcome to OptiSched API", "status": "running"}


@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "optisched-backend"}


@app.get("/api/health/database")
def database_health():
    try:
        check_database_connection()
        return {"status": "healthy", "database": "connected"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection failed")


# -------------------- Faculty APIs --------------------
@app.get("/api/faculty")
def list_faculty(db: Session = Depends(get_db)):
    faculty_members = db.query(Faculty).order_by(Faculty.name).all()

    # Calculate workloads from course offerings
    offerings = db.query(CourseOffering).all()
    workloads: dict[int, int] = {}
    for o in offerings:
        workloads[o.faculty_id] = workloads.get(o.faculty_id, 0) + o.weekly_periods

    # Fetch subject qualifications
    mappings = db.query(FacultySubject).all()
    subjects = {s.id: s for s in db.query(Subject).all()}
    qualifications_map: dict[int, list[dict]] = {}
    for m in mappings:
        if m.subject_id in subjects:
            subj = subjects[m.subject_id]
            qualifications_map.setdefault(m.faculty_id, []).append({
                "subject_id": subj.id,
                "code": subj.code,
                "name": subj.name,
                "department": subj.department,
            })

    return [
        {
            "id": f.id,
            "employee_id": f.employee_id,
            "name": f.name,
            "email": f.email,
            "department": f.department,
            "is_active": f.is_active,
            "weekly_workload": workloads.get(f.id, 0),
            "qualifications": qualifications_map.get(f.id, []),
        }
        for f in faculty_members
    ]


@app.get("/api/faculty/{faculty_id}")
def get_faculty(faculty_id: int, db: Session = Depends(get_db)):
    fac = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    offerings = db.query(CourseOffering).filter(CourseOffering.faculty_id == faculty_id).all()
    weekly_workload = sum(o.weekly_periods for o in offerings)

    mappings = db.query(FacultySubject).filter(FacultySubject.faculty_id == faculty_id).all()
    subject_ids = [m.subject_id for m in mappings]
    subjects = db.query(Subject).filter(Subject.id.in_(subject_ids)).all() if subject_ids else []

    return {
        "id": fac.id,
        "employee_id": fac.employee_id,
        "name": fac.name,
        "email": fac.email,
        "department": fac.department,
        "is_active": fac.is_active,
        "weekly_workload": weekly_workload,
        "qualifications": [
            {"subject_id": s.id, "code": s.code, "name": s.name, "department": s.department}
            for s in subjects
        ],
        "assigned_offerings": [
            {
                "id": o.id,
                "class_id": o.class_id,
                "subject_id": o.subject_id,
                "weekly_periods": o.weekly_periods,
                "requires_lab": o.requires_lab,
            }
            for o in offerings
        ],
    }


@app.post("/api/faculty", status_code=201)
def create_faculty(
    faculty_data: FacultyCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    existing = db.query(Faculty).filter(
        (Faculty.employee_id == faculty_data.employee_id)
        | (Faculty.email == str(faculty_data.email))
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Employee ID or email already exists")

    faculty = Faculty(
        employee_id=faculty_data.employee_id,
        name=faculty_data.name,
        email=str(faculty_data.email),
        department=faculty_data.department,
    )
    try:
        db.add(faculty)
        db.commit()
        db.refresh(faculty)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create faculty member")
    return {
        "message": "Faculty created successfully",
        "id": faculty.id,
        "employee_id": faculty.employee_id,
        "name": faculty.name,
        "email": faculty.email,
        "department": faculty.department,
        "is_active": faculty.is_active,
    }


@app.put("/api/faculty/{faculty_id}")
def update_faculty(
    faculty_id: int,
    faculty_data: FacultyUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    if faculty_data.email and faculty_data.email != faculty.email:
        existing_email = db.query(Faculty).filter(
            Faculty.email == str(faculty_data.email), Faculty.id != faculty_id
        ).first()
        if existing_email:
            raise HTTPException(status_code=409, detail="Email already in use by another faculty member")
        faculty.email = str(faculty_data.email)

    if faculty_data.name is not None:
        faculty.name = faculty_data.name
    if faculty_data.department is not None:
        faculty.department = faculty_data.department
    if faculty_data.is_active is not None:
        faculty.is_active = faculty_data.is_active

    try:
        db.commit()
        db.refresh(faculty)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not update faculty member")

    return {
        "message": "Faculty updated successfully",
        "id": faculty.id,
        "employee_id": faculty.employee_id,
        "name": faculty.name,
        "email": faculty.email,
        "department": faculty.department,
        "is_active": faculty.is_active,
    }


@app.delete("/api/faculty/{faculty_id}")
def delete_faculty(
    faculty_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    # Safeguard: prevent deletion if assigned to existing course offerings
    active_offerings = db.query(CourseOffering).filter(CourseOffering.faculty_id == faculty_id).all()
    if active_offerings:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete faculty '{faculty.name}': currently assigned to "
                f"{len(active_offerings)} active course offering(s). "
                f"Reassign or remove the course offerings before deleting."
            ),
        )

    try:
        # Remove qualification mappings first
        db.query(FacultySubject).filter(FacultySubject.faculty_id == faculty_id).delete()
        db.delete(faculty)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete faculty member")

    return {
        "message": f"Faculty member '{faculty.name}' deleted successfully",
        "id": faculty_id,
    }


@app.post("/api/faculty/{faculty_id}/qualifications", status_code=201)
def assign_faculty_qualification(
    faculty_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    subject_id = payload.get("subject_id")
    if not subject_id:
        raise HTTPException(status_code=400, detail="subject_id is required")

    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    existing = db.query(FacultySubject).filter(
        FacultySubject.faculty_id == faculty_id,
        FacultySubject.subject_id == subject_id,
    ).first()
    if existing:
        return {"message": "Faculty qualification already exists", "id": existing.id}

    fs = FacultySubject(faculty_id=faculty_id, subject_id=subject_id)
    try:
        db.add(fs)
        db.commit()
        db.refresh(fs)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not assign qualification")

    return {
        "message": f"Subject '{subject.name}' mapped to '{faculty.name}' successfully",
        "id": fs.id,
        "faculty_id": faculty_id,
        "subject_id": subject_id,
    }


@app.delete("/api/faculty/{faculty_id}/qualifications/{subject_id}")
def remove_faculty_qualification(
    faculty_id: int,
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    mapping = db.query(FacultySubject).filter(
        FacultySubject.faculty_id == faculty_id,
        FacultySubject.subject_id == subject_id,
    ).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Qualification mapping not found")

    # Safeguard: prevent removing qualification if faculty currently teaches this subject in active course offerings
    active_offering = db.query(CourseOffering).filter(
        CourseOffering.faculty_id == faculty_id,
        CourseOffering.subject_id == subject_id,
    ).first()
    if active_offering:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot remove qualification: this faculty member is actively assigned to "
                "teach this subject in a course offering. Reassign the offering first."
            ),
        )

    try:
        db.delete(mapping)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not remove qualification")

    return {
        "message": "Qualification removed successfully",
        "faculty_id": faculty_id,
        "subject_id": subject_id,
    }


# -------------------- Student Section APIs --------------------
@app.post("/api/sections", status_code=201)
def create_section(
    section_data: SectionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not 1 <= section_data.semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8")
    if not 1 <= section_data.academic_year <= 4:
        raise HTTPException(status_code=400, detail="Academic year must be between 1 and 4")
    if db.query(ClassSection).filter(ClassSection.name == section_data.name).first():
        raise HTTPException(status_code=409, detail="Section name already exists")
    section = ClassSection(
        name=section_data.name, department=section_data.department,
        academic_year=section_data.academic_year, semester=section_data.semester,
    )
    try:
        db.add(section)
        db.commit()
        db.refresh(section)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create section")
    return {
        "message": "Section created successfully", "id": section.id,
        "name": section.name, "department": section.department,
        "academic_year": section.academic_year, "semester": section.semester,
        "is_active": section.is_active,
    }


@app.get("/api/sections")
def list_sections(db: Session = Depends(get_db)):
    sections = db.query(ClassSection).order_by(ClassSection.semester, ClassSection.name).all()
    return [
        {
            "id": s.id, "name": s.name, "department": s.department,
            "academic_year": s.academic_year, "semester": s.semester,
            "is_active": s.is_active,
        }
        for s in sections
    ]


# -------------------- Subject APIs --------------------
@app.post("/api/subjects", status_code=201)
def create_subject(
    subject_data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if db.query(Subject).filter(Subject.code == subject_data.code).first():
        raise HTTPException(status_code=409, detail="Subject code already exists")
    subject = Subject(
        code=subject_data.code, name=subject_data.name, department=subject_data.department,
    )
    try:
        db.add(subject)
        db.commit()
        db.refresh(subject)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create subject")
    return {
        "message": "Subject created successfully", "id": subject.id,
        "code": subject.code, "name": subject.name, "department": subject.department,
    }


@app.get("/api/subjects")
def list_subjects(db: Session = Depends(get_db)):
    subjects = db.query(Subject).order_by(Subject.code).all()
    return [
        {"id": s.id, "code": s.code, "name": s.name, "department": s.department}
        for s in subjects
    ]


# -------------------- Rooms APIs --------------------
@app.post("/api/rooms", status_code=201)
def create_room(
    room_data: RoomCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if room_data.capacity <= 0:
        raise HTTPException(status_code=400, detail="Room capacity must be greater than zero")
    if room_data.room_type not in {"classroom", "lab", "lecture_hall"}:
        raise HTTPException(
            status_code=400,
            detail="Room type must be classroom, lab, or lecture_hall",
        )
    if db.query(Room).filter(Room.name == room_data.name).first():
        raise HTTPException(status_code=409, detail="Room name already exists")
    room = Room(
        name=room_data.name, room_type=room_data.room_type,
        capacity=room_data.capacity, building=room_data.building,
    )
    try:
        db.add(room)
        db.commit()
        db.refresh(room)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create room")
    return {
        "message": "Room created successfully", "id": room.id, "name": room.name,
        "room_type": room.room_type, "capacity": room.capacity,
        "building": room.building, "is_active": room.is_active,
    }


@app.get("/api/rooms")
def list_rooms(db: Session = Depends(get_db)):
    rooms = db.query(Room).order_by(Room.name).all()
    return [
        {
            "id": r.id, "name": r.name, "room_type": r.room_type,
            "capacity": r.capacity, "building": r.building, "is_active": r.is_active,
        }
        for r in rooms
    ]


# -------------------- Course Offerings APIs --------------------
@app.post("/api/course-offerings", status_code=201)
def create_course_offering(
    offering_data: CourseOfferingCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if offering_data.weekly_periods < 1:
        raise HTTPException(status_code=400, detail="Weekly periods must be at least 1")
    section = db.query(ClassSection).filter(
        ClassSection.id == offering_data.class_id,
        ClassSection.is_active.is_(True),
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Active class section not found")
    if not db.query(Subject).filter(Subject.id == offering_data.subject_id).first():
        raise HTTPException(status_code=404, detail="Subject not found")
    faculty = db.query(Faculty).filter(
        Faculty.id == offering_data.faculty_id, Faculty.is_active.is_(True),
    ).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Active faculty member not found")
    if db.query(CourseOffering).filter(
        CourseOffering.class_id == offering_data.class_id,
        CourseOffering.subject_id == offering_data.subject_id,
    ).first():
        raise HTTPException(status_code=409, detail="This subject is already assigned to the class")

    offering = CourseOffering(
        class_id=offering_data.class_id, subject_id=offering_data.subject_id,
        faculty_id=offering_data.faculty_id, weekly_periods=offering_data.weekly_periods,
        requires_lab=offering_data.requires_lab,
    )
    try:
        db.add(offering)
        db.commit()
        db.refresh(offering)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create course offering")
    return {
        "message": "Course offering created successfully", "id": offering.id,
        "class_id": offering.class_id, "subject_id": offering.subject_id,
        "faculty_id": offering.faculty_id, "weekly_periods": offering.weekly_periods,
        "requires_lab": offering.requires_lab,
    }


@app.get("/api/course-offerings")
def list_course_offerings(db: Session = Depends(get_db)):
    offerings = db.query(CourseOffering).order_by(
        CourseOffering.class_id, CourseOffering.subject_id,
    ).all()
    return [
        {
            "id": o.id, "class_id": o.class_id, "subject_id": o.subject_id,
            "faculty_id": o.faculty_id, "weekly_periods": o.weekly_periods,
            "requires_lab": o.requires_lab,
        }
        for o in offerings
    ]


# -------------------- OR-Tools Timetable Generation --------------------
# Default: 09:00-16:00. Five-minute transitions are between teaching periods.
# Break 1: 10:50-11:00. Lunch: 12:45-13:30. Break 2: 14:10-14:20.
# Friday is configured as a half-day example. Custom days can be supplied per request.
def make_default_day(day: str, half_day: bool = False) -> DaySchedule:
    slots = [
        TimeSlot(name="Period 1", start_time="09:00", end_time="09:50"),
        TimeSlot(name="Period 2", start_time="09:55", end_time="10:45"),
        TimeSlot(name="Period 3", start_time="11:00", end_time="11:50"),
        TimeSlot(name="Period 4", start_time="11:55", end_time="12:45"),
    ]
    if not half_day:
        slots.extend([
            TimeSlot(name="Period 5", start_time="13:30", end_time="14:05"),
            TimeSlot(name="Period 6", start_time="14:20", end_time="15:10"),
            TimeSlot(name="Period 7", start_time="15:15", end_time="16:00"),
        ])
    return DaySchedule(day=day, is_half_day=half_day, slots=slots)


DEFAULT_DAYS = [
    make_default_day("Monday"),
    make_default_day("Tuesday"),
    make_default_day("Wednesday"),
    make_default_day("Thursday"),
    make_default_day("Friday", half_day=True),
]

DEFAULT_BREAKS = [
    BreakItem(name="Short Break 1", start_time="10:50", end_time="11:00", duration=10, is_lunch=False),
    BreakItem(name="Short Break 2", start_time="14:10", end_time="14:20", duration=10, is_lunch=False),
]

DEFAULT_LUNCH = BreakItem(
    name="Lunch Break", start_time="12:45", end_time="13:30", duration=45, is_lunch=True
)


def _to_minutes(value: str) -> int:
    try:
        parsed = datetime.strptime(value.strip(), "%H:%M")
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid time '{value}'. Use 24-hour HH:MM format.",
        ) from exc
    return parsed.hour * 60 + parsed.minute


def _flatten_and_validate_days(
    days: list[DaySchedule],
    breaks: list[BreakItem] | None = None,
    lunch_break: BreakItem | None = None,
    transition_minutes: int | None = None,
) -> list[dict]:
    if not days:
        raise HTTPException(status_code=400, detail="At least one day is required.")
    seen_days = set()
    flattened = []

    # Validate break items if supplied
    validated_breaks = []
    all_breaks = list(breaks or [])
    if lunch_break:
        all_breaks.append(lunch_break)

    for idx_b, b in enumerate(all_breaks):
        b_name = b.name.strip() or "Break"
        b_start, b_end = _to_minutes(b.start_time), _to_minutes(b.end_time)
        if b_end <= b_start:
            raise HTTPException(
                status_code=400,
                detail=f"Break '{b_name}': end_time ({b.end_time}) must be after start_time ({b.start_time}).",
            )
        # Check against previously validated breaks to prevent overlapping breaks
        for prev_b in validated_breaks:
            if max(b_start, prev_b["start"]) < min(b_end, prev_b["end"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Break '{b_name}' ({b.start_time}–{b.end_time}) overlaps with break '{prev_b['name']}'.",
                )
        validated_breaks.append({
            "name": b_name,
            "start": b_start,
            "end": b_end,
            "is_lunch": b.is_lunch,
        })

    for day_index, day in enumerate(days):
        day_name = day.day.strip()
        if not day_name:
            raise HTTPException(status_code=400, detail="Day name cannot be empty.")
        matched_day = next((d for d in VALID_DAYS if d.lower() == day_name.lower()), None)
        if not matched_day:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid day '{day_name}'. Must be one of: {', '.join(VALID_DAYS)}.",
            )
        day_name = matched_day

        if day_name.lower() in seen_days:
            raise HTTPException(status_code=400, detail=f"Duplicate day: {day_name}.")
        seen_days.add(day_name.lower())

        if not day.slots:
            raise HTTPException(
                status_code=400,
                detail=f"Day {day_name} must have at least one period slot.",
            )

        previous_end = None
        for slot_index, slot in enumerate(day.slots):
            slot_name = slot.name.strip()
            if not slot_name:
                raise HTTPException(
                    status_code=400,
                    detail=f"{day_name} slot {slot_index + 1}: Slot name cannot be empty.",
                )
            start, end = _to_minutes(slot.start_time), _to_minutes(slot.end_time)
            if end <= start:
                raise HTTPException(
                    status_code=400,
                    detail=f"{day_name} {slot_name}: end_time ({slot.end_time}) must be after start_time ({slot.start_time}).",
                )
            # Periods on the same day cannot overlap
            if previous_end is not None and start < previous_end:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{day_name} {slot_name} starts at {slot.start_time}, which overlaps "
                        f"with the previous period ending at {day.slots[slot_index - 1].end_time}."
                    ),
                )
            # Transition check if explicitly specified
            if (
                transition_minutes is not None
                and transition_minutes > 0
                and previous_end is not None
                and start < previous_end + transition_minutes
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{day_name} {slot_name} must start at least {transition_minutes} "
                        f"minutes after previous period ends."
                    ),
                )

            # Check no overlap with configured breaks/lunch
            for brk in validated_breaks:
                if max(start, brk["start"]) < min(end, brk["end"]):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"{day_name} {slot_name} ({slot.start_time}–{slot.end_time}) "
                            f"overlaps with break '{brk['name']}'."
                        ),
                    )

            flattened.append({
                "day": day_name,
                "day_index": day_index,
                "slot_index": slot_index,
                "name": slot_name,
                "start_time": slot.start_time,
                "end_time": slot.end_time,
                "start_minute": start,
                "end_minute": end,
            })
            previous_end = end
    return flattened


# -------------------- Timetable Configuration APIs --------------------
@app.get("/api/timetable/configurations")
def list_timetable_configurations(db: Session = Depends(get_db)):
    configs = db.query(TimetableConfig).order_by(TimetableConfig.semester.asc()).all()
    return [
        {
            "id": c.id,
            "semester": c.semester,
            "days": c.days,
            "working_hours_start": c.working_hours_start,
            "working_hours_end": c.working_hours_end,
            "working_hours": f"{c.working_hours_start or '09:00'}-{c.working_hours_end or '16:00'}",
            "period_duration": c.period_duration,
            "transition_duration": c.transition_duration,
            "breaks": c.breaks or [],
            "lunch_break": c.lunch_break,
            "is_active": c.is_active,
            "configured": True,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }
        for c in configs
    ]


@app.get("/api/timetable/configurations/{semester}")
def get_timetable_configuration(semester: int, db: Session = Depends(get_db)):
    if not 1 <= semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8.")

    config = db.query(TimetableConfig).filter(
        TimetableConfig.semester == semester
    ).first()

    if config:
        return {
            "id": config.id,
            "semester": config.semester,
            "days": config.days,
            "working_hours_start": config.working_hours_start,
            "working_hours_end": config.working_hours_end,
            "working_hours": f"{config.working_hours_start or '09:00'}-{config.working_hours_end or '16:00'}",
            "period_duration": config.period_duration or 50,
            "transition_duration": config.transition_duration if config.transition_duration is not None else 5,
            "breaks": config.breaks or [],
            "lunch_break": config.lunch_break,
            "is_active": config.is_active,
            "configured": True,
            "updated_at": config.updated_at.isoformat() if config.updated_at else None,
        }

    # Default fallback schedule if semester has not been customized yet
    default_days_dict = [day.model_dump() for day in DEFAULT_DAYS]
    default_breaks_dict = [b.model_dump() for b in DEFAULT_BREAKS]
    return {
        "semester": semester,
        "days": default_days_dict,
        "working_hours_start": "09:00",
        "working_hours_end": "16:00",
        "working_hours": "09:00-16:00",
        "period_duration": 50,
        "transition_duration": 5,
        "breaks": default_breaks_dict,
        "lunch_break": DEFAULT_LUNCH.model_dump(),
        "is_active": True,
        "configured": False,
    }


@app.put("/api/timetable/configurations/{semester}")
def save_timetable_configuration(
    semester: int,
    data: TimetableConfigSave,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not 1 <= semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8.")

    flattened = _flatten_and_validate_days(
        data.days,
        breaks=data.breaks,
        lunch_break=data.lunch_break,
        transition_minutes=data.transition_duration,
    )

    all_starts = [s["start_time"] for s in flattened]
    all_ends = [s["end_time"] for s in flattened]
    start_wh = data.working_hours_start or (min(all_starts) if all_starts else "09:00")
    end_wh = data.working_hours_end or (max(all_ends) if all_ends else "16:00")

    if _to_minutes(end_wh) <= _to_minutes(start_wh):
        raise HTTPException(
            status_code=400,
            detail=f"Working hours end ({end_wh}) must be after working hours start ({start_wh}).",
        )

    serialized_days = [day.model_dump() for day in data.days]
    serialized_breaks = [b.model_dump() for b in data.breaks] if data.breaks is not None else []
    serialized_lunch = data.lunch_break.model_dump() if data.lunch_break else None

    config = db.query(TimetableConfig).filter(
        TimetableConfig.semester == semester
    ).first()

    if config:
        config.days = serialized_days
        config.working_hours_start = start_wh
        config.working_hours_end = end_wh
        config.period_duration = data.period_duration
        config.transition_duration = data.transition_duration
        config.breaks = serialized_breaks
        config.lunch_break = serialized_lunch
        config.is_active = data.is_active
        config.updated_at = datetime.utcnow()
    else:
        config = TimetableConfig(
            semester=semester,
            days=serialized_days,
            working_hours_start=start_wh,
            working_hours_end=end_wh,
            period_duration=data.period_duration,
            transition_duration=data.transition_duration,
            breaks=serialized_breaks,
            lunch_break=serialized_lunch,
            is_active=data.is_active,
        )
        db.add(config)

    try:
        db.commit()
        db.refresh(config)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not save timetable configuration."
        ) from exc

    return {
        "message": f"Timetable configuration saved successfully for Semester {semester}.",
        "id": config.id,
        "semester": config.semester,
        "days": config.days,
        "working_hours_start": config.working_hours_start,
        "working_hours_end": config.working_hours_end,
        "working_hours": f"{config.working_hours_start}-{config.working_hours_end}",
        "period_duration": config.period_duration,
        "transition_duration": config.transition_duration,
        "breaks": config.breaks,
        "lunch_break": config.lunch_break,
        "is_active": config.is_active,
        "configured": True,
    }


@app.delete("/api/timetable/configurations/{semester}")
def delete_timetable_configuration(
    semester: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not 1 <= semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8.")

    config = db.query(TimetableConfig).filter(
        TimetableConfig.semester == semester
    ).first()

    if not config:
        return {
            "message": f"No custom configuration found for Semester {semester}. Default configuration is active.",
            "semester": semester,
            "deleted": False,
        }

    try:
        db.delete(config)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not delete timetable configuration."
        ) from exc

    return {
        "message": f"Timetable configuration for Semester {semester} deleted. Reverted to default schedule.",
        "semester": semester,
        "deleted": True,
    }


# -------------------- Faculty-Subjects API --------------------
@app.get("/api/faculty-subjects")
def list_faculty_subjects(db: Session = Depends(get_db)):
    mappings = db.query(FacultySubject).all()
    return [
        {
            "id": m.id,
            "faculty_id": m.faculty_id,
            "subject_id": m.subject_id,
        }
        for m in mappings
    ]


# -------------------- Independent Schedule Validator --------------------
def _validate_generated_schedule(
    schedule_rows: list[dict],
    offerings: list[CourseOffering],
    rooms_map: dict[int, Room],
    faculty_map: dict[int, Faculty],
    subject_map: dict[int, Subject],
    faculty_subjects_map: dict[int, set[int]],
) -> dict:
    faculty_clashes = []
    room_clashes = []
    section_clashes = []
    eligibility_violations = []

    # 1. Overlapping session clash checks using continuous real-time intervals
    for i in range(len(schedule_rows)):
        for j in range(i + 1, len(schedule_rows)):
            a = schedule_rows[i]
            b = schedule_rows[j]
            if a["day"] != b["day"]:
                continue
            a_start, a_end = _to_minutes(a["start_time"]), _to_minutes(a["end_time"])
            b_start, b_end = _to_minutes(b["start_time"]), _to_minutes(b["end_time"])

            # Real-time overlap condition
            if max(a_start, b_start) < min(a_end, b_end):
                if a["faculty_id"] == b["faculty_id"]:
                    faculty_clashes.append(
                        f"Faculty {a['faculty_name']} double-booked on {a['day']} between "
                        f"{a['start_time']}–{a['end_time']} and {b['start_time']}–{b['end_time']}"
                    )
                if a["room_id"] == b["room_id"]:
                    room_clashes.append(
                        f"Room {a['room_name']} double-booked on {a['day']} between "
                        f"{a['start_time']}–{a['end_time']} and {b['start_time']}–{b['end_time']}"
                    )
                if a["class_id"] == b["class_id"]:
                    section_clashes.append(
                        f"Section {a['class_name']} double-booked on {a['day']} between "
                        f"{a['start_time']}–{a['end_time']} and {b['start_time']}–{b['end_time']}"
                    )

    # 2. Room eligibility check
    offering_by_pair = {(o.class_id, o.subject_id): o for o in offerings}
    for row in schedule_rows:
        off = offering_by_pair.get((row["class_id"], row["subject_id"]))
        if off and off.requires_lab:
            if row["room_type"] != "lab":
                eligibility_violations.append(
                    f"Lab subject {row['subject_code']} scheduled in non-lab room {row['room_name']} ({row['room_type']})"
                )
        else:
            if row["room_type"] == "lab":
                eligibility_violations.append(
                    f"Theory subject {row['subject_code']} scheduled in lab room {row['room_name']}"
                )

        # 3. Faculty-subject qualification check
        if faculty_subjects_map and row["subject_id"] in faculty_subjects_map:
            qualified_ids = faculty_subjects_map[row["subject_id"]]
            if row["faculty_id"] not in qualified_ids:
                eligibility_violations.append(
                    f"Faculty {row['faculty_name']} is not qualified for subject {row['subject_code']}"
                )

    total_clashes = (
        len(faculty_clashes)
        + len(room_clashes)
        + len(section_clashes)
        + len(eligibility_violations)
    )

    return {
        "is_valid": total_clashes == 0,
        "total_clashes": total_clashes,
        "faculty_clashes": len(faculty_clashes),
        "room_clashes": len(room_clashes),
        "section_clashes": len(section_clashes),
        "eligibility_violations": len(eligibility_violations),
        "details": {
            "faculty_clashes": faculty_clashes,
            "room_clashes": room_clashes,
            "section_clashes": section_clashes,
            "eligibility_violations": eligibility_violations,
        },
        "verified": total_clashes == 0,
    }


# -------------------- OR-Tools Generation Endpoint --------------------
@app.post("/api/timetable/generate")
def generate_timetable(
    request: TimetableGenerateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if request.scope in {"class", "section"} and request.class_id is None:
        raise HTTPException(status_code=400, detail="class_id is required for class/section scope.")
    if request.scope in {"semester", "department"} and not request.department:
        raise HTTPException(status_code=400, detail=f"department is required for {request.scope} scope.")
    if request.scope == "semester" and request.semester is None:
        raise HTTPException(status_code=400, detail="semester is required for semester scope.")

    # 1. Fetch matching active sections
    section_query = db.query(ClassSection).filter(ClassSection.is_active.is_(True))
    if request.scope in {"class", "section"}:
        section_query = section_query.filter(ClassSection.id == request.class_id)
    elif request.scope == "semester":
        section_query = section_query.filter(
            ClassSection.department == request.department,
            ClassSection.semester == request.semester,
        )
    elif request.scope == "department":
        section_query = section_query.filter(ClassSection.department == request.department)
    sections = section_query.order_by(ClassSection.semester, ClassSection.name).all()
    if not sections:
        raise HTTPException(status_code=404, detail="No active class sections matched this scope.")

    section_map = {s.id: s for s in sections}
    unique_semesters = sorted(set(s.semester for s in sections))

    # 2. Resolve schedule for each section
    saved_configs = {}
    saved_configs_raw = {}
    if request.days is None:
        configs_in_db = db.query(TimetableConfig).filter(
            TimetableConfig.semester.in_(unique_semesters),
            TimetableConfig.is_active.is_(True),
        ).all()
        for cfg in configs_in_db:
            saved_configs_raw[cfg.semester] = cfg
            saved_configs[cfg.semester] = [
                DaySchedule.model_validate(d) for d in cfg.days
            ]

    section_slots: dict[int, list[dict]] = {}
    section_days: dict[int, list[DaySchedule]] = {}
    for section in sections:
        if request.days is not None:
            days_to_use = request.days
        elif section.semester in saved_configs:
            days_to_use = saved_configs[section.semester]
        else:
            days_to_use = DEFAULT_DAYS

        section_days[section.id] = days_to_use
        flattened = _flatten_and_validate_days(days_to_use)
        if not flattened:
            raise HTTPException(
                status_code=400,
                detail=f"Section {section.name} (Semester {section.semester}) has no timetable periods configured.",
            )
        section_slots[section.id] = flattened

    # 3. Fetch course offerings, faculty, and rooms
    offerings = db.query(CourseOffering).filter(
        CourseOffering.class_id.in_(list(section_map.keys())),
    ).order_by(CourseOffering.class_id, CourseOffering.subject_id).all()
    if not offerings:
        raise HTTPException(status_code=400, detail="No course offerings are configured for this scope.")

    faculty_map = {
        f.id: f for f in db.query(Faculty).filter(Faculty.is_active.is_(True)).all()
    }
    subject_map = {s.id: s for s in db.query(Subject).all()}
    rooms = db.query(Room).filter(Room.is_active.is_(True)).order_by(Room.name).all()
    if not rooms:
        raise HTTPException(status_code=400, detail="Add at least one active room before generating.")

    classroom_rooms = [r for r in rooms if r.room_type in {"classroom", "lecture_hall"}]
    lab_rooms = [r for r in rooms if r.room_type == "lab"]

    # 4. Fetch faculty-subject mappings for eligibility checking
    all_fs = db.query(FacultySubject).all()
    fs_map: dict[int, set[int]] = {}
    for fs in all_fs:
        fs_map.setdefault(fs.subject_id, set()).add(fs.faculty_id)

    lessons = []
    section_lesson_count: dict[int, int] = {}
    faculty_lesson_count: dict[int, int] = {}

    for offering in offerings:
        section = section_map.get(offering.class_id)
        faculty = faculty_map.get(offering.faculty_id)
        subject = subject_map.get(offering.subject_id)
        if not section or not faculty or not subject:
            raise HTTPException(
                status_code=400,
                detail=f"Course offering {offering.id} references a missing/inactive section, faculty, or subject.",
            )

        # Faculty-subject eligibility check
        if offering.subject_id in fs_map:
            qualified_ids = fs_map[offering.subject_id]
            if offering.faculty_id not in qualified_ids:
                qualified_names = [faculty_map[fid].name for fid in qualified_ids if fid in faculty_map]
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Faculty '{faculty.name}' is not qualified to teach subject '{subject.code}: {subject.name}'. "
                        f"Qualified faculty: {', '.join(qualified_names) if qualified_names else 'None registered'}."
                    ),
                )

        if offering.requires_lab:
            eligible_rooms = lab_rooms
            if not eligible_rooms:
                raise HTTPException(
                    status_code=400,
                    detail=f"No active laboratory room is available for lab subject {subject.code}.",
                )
        else:
            eligible_rooms = classroom_rooms
            if not eligible_rooms:
                raise HTTPException(
                    status_code=400,
                    detail=f"No active classroom or lecture hall is available for non-lab subject {subject.code}.",
                )

        for occurrence in range(offering.weekly_periods):
            lessons.append({
                "section": section,
                "faculty": faculty,
                "subject": subject,
                "rooms": eligible_rooms,
                "occurrence": occurrence + 1,
                "offering": offering,
            })
            section_lesson_count[section.id] = section_lesson_count.get(section.id, 0) + 1
            faculty_lesson_count[faculty.id] = faculty_lesson_count.get(faculty.id, 0) + 1

    # Capacity check per section
    for sec_id, total_lessons in section_lesson_count.items():
        available_slots = len(section_slots[sec_id])
        if total_lessons > available_slots:
            sec_name = section_map[sec_id].name
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Section {sec_name} requires {total_lessons} weekly periods, but its configured schedule "
                    f"only provides {available_slots} periods. Add periods/days in Semester {section_map[sec_id].semester} "
                    f"configuration or reduce course periods."
                ),
            )

    # Capacity pre-check per faculty member across scope
    max_periods_any_grid = max(len(slots) for slots in section_slots.values())
    for fac_id, fac_lessons in faculty_lesson_count.items():
        if fac_lessons > max_periods_any_grid:
            fac_name = faculty_map[fac_id].name
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Faculty member '{fac_name}' is assigned {fac_lessons} weekly periods across sections in this scope, "
                    f"which exceeds the maximum schedule capacity of {max_periods_any_grid} periods. "
                    f"Add more faculty members to courses or distribute teaching loads to avoid impossible overlaps."
                ),
            )

    # Room capacity pre-checks across entire scope
    total_theory_lessons = sum(1 for l in lessons if not l["offering"].requires_lab)
    total_lab_lessons = sum(1 for l in lessons if l["offering"].requires_lab)
    total_classroom_capacity = len(classroom_rooms) * max_periods_any_grid
    total_lab_capacity = len(lab_rooms) * max_periods_any_grid

    if total_theory_lessons > total_classroom_capacity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient classroom capacity for this scope: requires {total_theory_lessons} theory periods, "
                f"but only {len(classroom_rooms)} active classroom(s) provide {total_classroom_capacity} total slots. "
                f"Add more classroom/lecture hall rooms or reduce weekly lecture periods."
            ),
        )

    if total_lab_lessons > total_lab_capacity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient laboratory capacity for this scope: requires {total_lab_lessons} lab periods, "
                f"but only {len(lab_rooms)} active lab(s) provide {total_lab_capacity} total slots. "
                f"Add more laboratory rooms or reduce weekly lab periods."
            ),
        )

    # 5. Build OR-Tools CP-SAT Model
    model = cp_model.CpModel()
    choice_vars = {}
    by_lesson = {}
    by_section_slot = {}
    faculty_day_intervals = {}
    room_day_intervals = {}
    section_day_vars = {}

    for lesson_i, lesson in enumerate(lessons):
        by_lesson[lesson_i] = []
        sec = lesson["section"]
        slots = section_slots[sec.id]
        fac = lesson["faculty"]

        for slot_i, slot in enumerate(slots):
            for room in lesson["rooms"]:
                var = model.NewBoolVar(f"x_l{lesson_i}_s{slot_i}_r{room.id}")
                choice_vars[(lesson_i, slot_i, room.id)] = (var, lesson, slot, room)
                by_lesson[lesson_i].append(var)
                by_section_slot.setdefault((sec.id, slot_i), []).append(var)

                # Time intervals for continuous-time exclusivity
                faculty_day_intervals.setdefault((fac.id, slot["day"]), []).append(
                    (var, slot["start_minute"], slot["end_minute"])
                )
                room_day_intervals.setdefault((room.id, slot["day"]), []).append(
                    (var, slot["start_minute"], slot["end_minute"])
                )

                # Group for daily distribution
                section_day_vars.setdefault((sec.id, slot["day"]), []).append(var)

    # Hard Constraint 1: Every lesson must be scheduled exactly once
    for variables in by_lesson.values():
        model.AddExactlyOne(variables)

    # Hard Constraint 2: Section exclusivity (at most one lesson per section per slot)
    for variables in by_section_slot.values():
        model.AddAtMostOne(variables)

    # Hard Constraint 3: Faculty exclusivity (zero simultaneous or overlapping sessions)
    for (fac_id, day_name), assignments in faculty_day_intervals.items():
        events = sorted(set(
            [a[1] for a in assignments] + [a[2] for a in assignments]
        ))
        for idx in range(len(events) - 1):
            t_start, t_end = events[idx], events[idx + 1]
            active_vars = [
                a[0] for a in assignments if a[1] < t_end and a[2] > t_start
            ]
            if len(active_vars) > 1:
                model.Add(sum(active_vars) <= 1)

    # Hard Constraint 4: Room exclusivity (zero simultaneous or overlapping room uses)
    for (room_id, day_name), assignments in room_day_intervals.items():
        events = sorted(set(
            [a[1] for a in assignments] + [a[2] for a in assignments]
        ))
        for idx in range(len(events) - 1):
            t_start, t_end = events[idx], events[idx + 1]
            active_vars = [
                a[0] for a in assignments if a[1] < t_end and a[2] > t_start
            ]
            if len(active_vars) > 1:
                model.Add(sum(active_vars) <= 1)

    # Objective Function:
    # Distribute sessions evenly across days of the week, with light early-period tie-breaker
    distribution_penalties = []
    for sec in sections:
        slots = section_slots[sec.id]
        days_present = list(set(s["day"] for s in slots))
        max_slots_in_any_day = max(
            len([s for s in slots if s["day"] == d]) for d in days_present
        )
        max_daily_var = model.NewIntVar(0, max_slots_in_any_day, f"max_daily_{sec.id}")
        for d in days_present:
            day_vars = section_day_vars.get((sec.id, d), [])
            if day_vars:
                model.Add(sum(day_vars) <= max_daily_var)
        distribution_penalties.append(30 * max_daily_var)

    period_order_terms = [
        (slot["slot_index"] + 1) * var
        for (lesson_i, slot_i, room_id), (var, lesson, slot, room) in choice_vars.items()
    ]
    model.Minimize(sum(distribution_penalties) + sum(period_order_terms))

    # 6. Solve CP-SAT Model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.max_time_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        status_name = solver.StatusName(status)
        raise HTTPException(
            status_code=409,
            detail=(
                f"No feasible timetable found (Solver status: {status_name}). "
                "Check that there are sufficient rooms, periods per day, and faculty availability without clash conflicts, "
                "or reduce weekly periods."
            ),
        )

    # 7. Build schedule output
    result = []
    scheduled_slots = []
    for (lesson_i, slot_i, room_id), (var, lesson, slot, room) in choice_vars.items():
        if solver.Value(var) != 1:
            continue
        scheduled_slots.append(slot)
        result.append({
            "day": slot["day"],
            "period": slot["name"],
            "start_time": slot["start_time"],
            "end_time": slot["end_time"],
            "class_id": lesson["section"].id,
            "class_name": lesson["section"].name,
            "department": lesson["section"].department,
            "semester": lesson["section"].semester,
            "subject_id": lesson["subject"].id,
            "subject_code": lesson["subject"].code,
            "subject_name": lesson["subject"].name,
            "faculty_id": lesson["faculty"].id,
            "faculty_name": lesson["faculty"].name,
            "room_id": room.id,
            "room_name": room.name,
            "room_type": room.room_type,
            "occurrence": lesson["occurrence"],
        })

    # Sort results chronologically by day, start_time, section
    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}
    result.sort(key=lambda row: (
        day_rank.get(row["day"], 99),
        _to_minutes(row["start_time"]),
        row["class_name"],
    ))

    # 8. Compute working hours and scheduled span accurately
    all_grid_slots = [s for slots in section_slots.values() for s in slots]
    grid_earliest = min(s["start_time"] for s in all_grid_slots) if all_grid_slots else "09:00"
    grid_latest = max(s["end_time"] for s in all_grid_slots) if all_grid_slots else "16:00"

    configured_semesters_used = [s for s in unique_semesters if s in saved_configs_raw]
    fallback_semesters_used = [s for s in unique_semesters if s not in saved_configs_raw]

    if request.days is not None:
        working_hours_display = f"{grid_earliest}-{grid_latest}"
        configuration_status = "custom_request"
    elif request.scope == "class" and len(sections) == 1:
        sec = sections[0]
        if sec.semester in saved_configs_raw:
            cfg = saved_configs_raw[sec.semester]
            swh = cfg.working_hours_start or grid_earliest
            ewh = cfg.working_hours_end or grid_latest
            working_hours_display = f"{swh}-{ewh}"
            configuration_status = "saved"
        else:
            working_hours_display = "09:00-16:00"
            configuration_status = "fallback"
    else:
        if configured_semesters_used and not fallback_semesters_used:
            working_hours_display = f"{grid_earliest}-{grid_latest}"
            configuration_status = "saved"
        elif fallback_semesters_used and not configured_semesters_used:
            working_hours_display = "09:00-16:00"
            configuration_status = "fallback"
        else:
            working_hours_display = f"{grid_earliest}-{grid_latest}"
            configuration_status = "mixed"

    session_earliest = min(s["start_time"] for s in scheduled_slots) if scheduled_slots else grid_earliest
    session_latest = max(s["end_time"] for s in scheduled_slots) if scheduled_slots else grid_latest
    scheduled_span = f"{session_earliest}-{session_latest}"

    # 9. Independent post-solve verification
    validation_report = _validate_generated_schedule(
        schedule_rows=result,
        offerings=offerings,
        rooms_map={r.id: r for r in rooms},
        faculty_map=faculty_map,
        subject_map=subject_map,
        faculty_subjects_map=fs_map,
    )

    # 10. Notes
    notes = [
        f"Working hours active: {working_hours_display}.",
        f"Scheduled session window: {scheduled_span}.",
        "Faculty, section, and room exclusivity strictly enforced across all real-time intervals.",
        "Sessions distributed across configured weekdays using CP-SAT load-balancing.",
    ]
    if request.days is not None:
        notes.append("Applied custom schedule provided directly in generate request.")
    else:
        if configured_semesters_used:
            notes.append(
                f"Using saved timetable configuration for Semester(s): {', '.join(str(s) for s in configured_semesters_used)}."
            )
        if fallback_semesters_used:
            notes.append(
                f"Semester(s) {', '.join(str(s) for s in fallback_semesters_used)} using standard default schedule ({working_hours_display}) because no custom configuration has been saved yet."
            )

    return {
        "status": "success",
        "solver_status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "scope": request.scope,
        "working_hours": working_hours_display,
        "scheduled_span": scheduled_span,
        "configuration_status": configuration_status,
        "is_custom_configured": len(configured_semesters_used) > 0 and len(fallback_semesters_used) == 0,
        "configured_semesters": configured_semesters_used,
        "unconfigured_semesters": fallback_semesters_used,
        "sections_scheduled": len(sections),
        "weekly_sessions_scheduled": len(result),
        "schedule": result,
        "validation": validation_report,
        "notes": notes,
    }
