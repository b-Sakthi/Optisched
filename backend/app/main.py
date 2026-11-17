import os
from datetime import datetime
import csv
import io
import re
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, EmailStr, Field, field_validator
from ortools.sat.python import cp_model

from app.db.session import Base, engine, check_database_connection, SessionLocal
from app.models import (
    User,
    Faculty,
    ClassSection,
    Subject,
    Room,
    CourseOffering,
    TimetableConfig,
    FacultySubject,
    FacultyAvailability,
    PublishedTimetable,
    PublishedTimetableEntry,
)
from app.core.auth import get_current_user, require_admin, require_authenticated
from app.core.security import (
    verify_password,
    hash_password,
    MIN_PASSWORD_LENGTH,
    validate_password_policy,
)
from app.core.ulid import generate_ulid, is_valid_ulid
from app.schemas.user import UserCreate, UserUpdate, UserResponse


# -------------------- Request Schemas --------------------
class FacultyCreate(BaseModel):
    employee_id: str
    name: str
    email: EmailStr
    department: str
    is_active: bool = True


class FacultyUpdate(BaseModel):
    employee_id: str | None = None
    name: str | None = None
    email: EmailStr | None = None
    department: str | None = None
    is_active: bool | None = None


class SectionCreate(BaseModel):
    name: str
    department: str
    academic_year: int = Field(ge=1, le=4)
    semester: int = Field(ge=1, le=8)
    student_count: int | None = Field(default=None, ge=1, le=500)
    is_active: bool = True


class SectionUpdate(BaseModel):
    name: str | None = None
    department: str | None = None
    academic_year: int | None = Field(default=None, ge=1, le=4)
    semester: int | None = Field(default=None, ge=1, le=8)
    student_count: int | None = Field(default=None, ge=1, le=500)
    is_active: bool | None = None


class SubjectCreate(BaseModel):
    code: str
    name: str
    department: str


class SubjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    department: str | None = None


class RoomCreate(BaseModel):
    name: str
    room_type: str
    capacity: int = Field(gt=0)
    building: str | None = None
    is_active: bool = True


class RoomUpdate(BaseModel):
    name: str | None = None
    room_type: str | None = None
    capacity: int | None = Field(default=None, gt=0)
    building: str | None = None
    is_active: bool | None = None


class CourseOfferingCreate(BaseModel):
    class_id: int
    subject_id: int
    faculty_id: int
    weekly_periods: int = Field(ge=1, le=35)
    requires_lab: bool = False


class CourseOfferingUpdate(BaseModel):
    class_id: int | None = None
    subject_id: int | None = None
    faculty_id: int | None = None
    weekly_periods: int | None = Field(default=None, ge=1, le=35)
    requires_lab: bool | None = None


class FacultySubjectCreate(BaseModel):
    faculty_id: int
    subject_id: int


class FacultyAvailabilityCreate(BaseModel):
    faculty_id: int
    day: str
    start_time: str
    end_time: str
    is_available: bool = False
    reason: str | None = None


class FacultyAvailabilityUpdate(BaseModel):
    day: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    is_available: bool | None = None
    reason: str | None = None


class TimetablePublishRequest(BaseModel):
    title: str
    scope: Literal["class", "section", "semester", "department", "university"] = "class"
    class_id: int | None = None
    department: str | None = None
    semester: int | None = None
    working_hours: str = "09:00-16:00"
    solver_status: str = "optimal"
    solve_time_seconds: float | None = None
    sections_scheduled: int = 1
    weekly_sessions_scheduled: int = 0
    schedule: list[dict]
    validation: dict | None = None
    notes: list[str] | None = None


class CsvImportRequest(BaseModel):
    entity: Literal["sections", "subjects", "faculty", "faculty_subjects", "rooms", "requirements"]
    csv_content: str
    preview_only: bool = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=MIN_PASSWORD_LENGTH,
        description=f"User password (minimum {MIN_PASSWORD_LENGTH} characters)",
    )

    @field_validator("password")
    @classmethod
    def validate_password_min_length(cls, v: str) -> str:
        validate_password_policy(v)
        return v


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
    department: str | None = None
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
    # Automatically initialize admin account from environment if provided (production/dev mode only)
    if os.getenv("TESTING") != "1":
        try:
            from init_admin import ensure_admin_user_exists
            ensure_admin_user_exists()
        except Exception:
            pass


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


# -------------------- Authentication & Login APIs --------------------
@app.post("/api/auth/login")
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticates a user using bcrypt password verification against stored password_hash.
    Never stores or logs plain passwords.
    """
    email_clean = str(credentials.email).strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    dashboard_map = {
        "admin": "/admin",
        "faculty": "/faculty",
        "student": "/student",
    }

    return {
        "status": "success",
        "message": f"Successfully authenticated as {user.role}",
        "user": {
            "id": user.id,
            "id_str": str(user.id),
            "email": user.email,
            "role": user.role,
            "name": user.name,
        },
        "target_dashboard": dashboard_map.get(user.role, "/student"),
    }


@app.get("/api/auth/password-policy")
def get_password_policy():
    """
    Returns current application password policy settings.
    Enforces minimum 8 characters across all roles.
    """
    return {
        "min_length": MIN_PASSWORD_LENGTH,
        "algorithm": "bcrypt",
        "description": f"Minimum password length is {MIN_PASSWORD_LENGTH} characters for all accounts including Admin.",
    }


# -------------------- User Management & Retrieval APIs --------------------
@app.get("/api/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    """
    Returns all registered users with their 26-character ULIDs.
    """
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        UserResponse(
            id=u.id,
            id_str=str(u.id),
            email=u.email,
            role=u.role,
            name=u.name,
            is_active=u.is_active,
            created_at=u.created_at,
            updated_at=u.updated_at,
        )
        for u in users
    ]


@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a user by their 26-character ULID string.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found")
    return UserResponse(
        id=user.id,
        id_str=str(user.id),
        email=user.email,
        role=user.role,
        name=user.name,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.post("/api/users", response_model=UserResponse, status_code=201)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Creates a new user account with an automatically generated 26-character ULID,
    storing only bcrypt password hashes.
    """
    email_clean = str(user_in.email).strip().lower()
    existing = db.query(User).filter(User.email == email_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"User with email '{email_clean}' already exists")

    new_user = User(
        id=generate_ulid(),
        email=email_clean,
        password_hash=hash_password(user_in.password),
        role=user_in.role,
        name=user_in.name,
        is_active=user_in.is_active,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return UserResponse(
        id=new_user.id,
        id_str=str(new_user.id),
        email=new_user.email,
        role=new_user.role,
        name=new_user.name,
        is_active=new_user.is_active,
        created_at=new_user.created_at,
        updated_at=new_user.updated_at,
    )


@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, user_update: UserUpdate, db: Session = Depends(get_db)):
    """
    Updates an existing user. If a new password is provided, strictly validates
    the minimum 8-character policy and re-hashes with bcrypt.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found")

    if user_update.email is not None:
        email_clean = str(user_update.email).strip().lower()
        conflict = db.query(User).filter(User.email == email_clean, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"User with email '{email_clean}' already exists")
        user.email = email_clean

    if user_update.name is not None:
        user.name = user_update.name
    if user_update.role is not None:
        user.role = user_update.role
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.password is not None:
        validate_password_policy(user_update.password, role=user.role)
        user.password_hash = hash_password(user_update.password)

    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id,
        id_str=str(user.id),
        email=user.email,
        role=user.role,
        name=user.name,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.delete("/api/users/{user_id}", status_code=200)
def delete_user(user_id: str, db: Session = Depends(get_db)):
    """
    Deletes a user account by ULID.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found")
    db.delete(user)
    db.commit()
    return {"status": "success", "message": f"User '{user_id}' successfully deleted"}


# -------------------- Admin System Monitoring APIs --------------------
@app.get("/api/admin/system/status")
def get_system_status(db: Session = Depends(get_db)):
    """
    Provides real-time system metrics, database health, entity counts,
    and security policy configuration for Admin monitoring and dashboard analytics.
    """
    user_count = db.query(User).count()
    section_count = db.query(ClassSection).count()
    subject_count = db.query(Subject).count()
    faculty_count = db.query(Faculty).count()
    room_count = db.query(Room).count()
    offering_count = db.query(CourseOffering).count()
    config_count = db.query(TimetableConfig).count()
    published_count = db.query(PublishedTimetable).count()

    admin_count = db.query(User).filter(User.role == "admin").count()
    faculty_user_count = db.query(User).filter(User.role == "faculty").count()
    student_user_count = db.query(User).filter(User.role == "student").count()

    return {
        "status": "healthy",
        "service": "OptiSched University Operations Platform",
        "version": "0.2.0",
        "timestamp": datetime.utcnow().isoformat(),
        "database": {
            "connected": True,
            "engine": engine.dialect.name,
        },
        "password_policy": {
            "min_length": MIN_PASSWORD_LENGTH,
            "hashing_algorithm": "bcrypt",
            "enforced_roles": ["admin", "faculty", "student"],
        },
        "analytics": {
            "total_users": user_count,
            "admins": admin_count,
            "faculty_users": faculty_user_count,
            "student_users": student_user_count,
            "sections": section_count,
            "subjects": subject_count,
            "faculty_members": faculty_count,
            "rooms": room_count,
            "course_offerings": offering_count,
            "timetable_configs": config_count,
            "published_timetables": published_count,
        },
    }


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
    current_user: dict = Depends(require_admin),
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
    current_user: dict = Depends(require_admin),
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
    current_user: dict = Depends(require_admin),
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
    current_user: dict = Depends(require_admin),
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
    current_user: dict = Depends(require_admin),
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


# -------------------- Academic Data Overview --------------------
@app.get("/api/academic-data/overview")
def get_academic_data_overview(db: Session = Depends(get_db)):
    sections = db.query(ClassSection).all()
    subjects = db.query(Subject).all()
    faculty = db.query(Faculty).all()
    rooms = db.query(Room).all()
    mappings = db.query(FacultySubject).all()
    offerings = db.query(CourseOffering).all()

    classrooms = [r for r in rooms if r.room_type in ("classroom", "lecture_hall")]
    labs = [r for r in rooms if r.room_type == "lab"]
    active_faculty = [f for f in faculty if f.is_active]
    active_sections = [s for s in sections if s.is_active]

    # Calculate system readiness for timetable generation
    missing_requirements = []
    if not active_sections:
        missing_requirements.append("At least 1 active class section is required.")
    if not subjects:
        missing_requirements.append("At least 1 subject is required.")
    if not active_faculty:
        missing_requirements.append("At least 1 active faculty member is required.")
    if not classrooms:
        missing_requirements.append("At least 1 classroom is required.")
    if not offerings:
        missing_requirements.append("At least 1 course requirement/offering is required.")

    # Distinct departments
    departments = sorted(list(set(
        [s.department for s in sections if s.department] +
        [sub.department for sub in subjects if sub.department] +
        [f.department for f in faculty if f.department]
    )))

    return {
        "sections_count": len(sections),
        "active_sections_count": len(active_sections),
        "subjects_count": len(subjects),
        "faculty_count": len(faculty),
        "active_faculty_count": len(active_faculty),
        "rooms_count": len(rooms),
        "classrooms_count": len(classrooms),
        "labs_count": len(labs),
        "qualifications_count": len(mappings),
        "offerings_count": len(offerings),
        "departments": departments,
        "ready_for_scheduling": len(missing_requirements) == 0,
        "readiness_details": missing_requirements if missing_requirements else ["All core prerequisites configured for timetable optimization."],
    }


# -------------------- Student Section APIs --------------------
@app.post("/api/sections", status_code=201)
def create_section(
    section_data: SectionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    name_clean = section_data.name.strip()
    dept_clean = section_data.department.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Section name cannot be empty")
    if not dept_clean:
        raise HTTPException(status_code=400, detail="Department cannot be empty")
    if not 1 <= section_data.semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8")
    if not 1 <= section_data.academic_year <= 4:
        raise HTTPException(status_code=400, detail="Academic year must be between 1 and 4")
    if section_data.student_count is not None and section_data.student_count < 1:
        raise HTTPException(status_code=400, detail="Student count must be a positive integer")
    existing = db.query(ClassSection).filter(
        ClassSection.department == dept_clean,
        ClassSection.academic_year == section_data.academic_year,
        ClassSection.semester == section_data.semester,
        ClassSection.name == name_clean,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Section '{name_clean}' already exists in department '{dept_clean}' (Year {section_data.academic_year}, Semester {section_data.semester})",
        )
    section = ClassSection(
        name=name_clean, department=dept_clean,
        academic_year=section_data.academic_year, semester=section_data.semester,
        student_count=section_data.student_count,
        is_active=section_data.is_active,
    )
    try:
        db.add(section)
        db.commit()
        db.refresh(section)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Section '{name_clean}' already exists in department '{dept_clean}' (Year {section_data.academic_year}, Semester {section_data.semester})",
        )
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create section")
    return {
        "message": "Section created successfully", "id": section.id,
        "name": section.name, "department": section.department,
        "academic_year": section.academic_year, "semester": section.semester,
        "student_count": section.student_count,
        "is_active": section.is_active,
    }


@app.get("/api/sections")
def list_sections(db: Session = Depends(get_db)):
    sections = db.query(ClassSection).order_by(ClassSection.semester, ClassSection.name).all()
    offerings = db.query(CourseOffering).all()
    off_counts: dict[int, int] = {}
    for o in offerings:
        off_counts[o.class_id] = off_counts.get(o.class_id, 0) + 1

    return [
        {
            "id": s.id, "name": s.name, "department": s.department,
            "academic_year": s.academic_year, "semester": s.semester,
            "student_count": getattr(s, "student_count", None),
            "is_active": s.is_active,
            "offerings_count": off_counts.get(s.id, 0),
        }
        for s in sections
    ]


@app.get("/api/sections/{section_id}")
def get_section(section_id: int, db: Session = Depends(get_db)):
    sec = db.query(ClassSection).filter(ClassSection.id == section_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")
    offerings = db.query(CourseOffering).filter(CourseOffering.class_id == section_id).all()
    return {
        "id": sec.id,
        "name": sec.name,
        "department": sec.department,
        "academic_year": sec.academic_year,
        "semester": sec.semester,
        "student_count": getattr(sec, "student_count", None),
        "is_active": sec.is_active,
        "offerings_count": len(offerings),
    }


@app.put("/api/sections/{section_id}")
def update_section(
    section_id: int,
    section_data: SectionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    sec = db.query(ClassSection).filter(ClassSection.id == section_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")

    name_clean = section_data.name.strip() if section_data.name is not None else None
    if name_clean is not None and not name_clean:
        raise HTTPException(status_code=400, detail="Section name cannot be empty")

    dept_clean = section_data.department.strip() if section_data.department is not None else None
    if dept_clean is not None and not dept_clean:
        raise HTTPException(status_code=400, detail="Department cannot be empty")

    target_name = name_clean if name_clean is not None else sec.name
    target_dept = dept_clean if dept_clean is not None else sec.department
    target_year = section_data.academic_year if section_data.academic_year is not None else sec.academic_year
    target_sem = section_data.semester if section_data.semester is not None else sec.semester

    if (
        section_data.name is not None
        or section_data.department is not None
        or section_data.academic_year is not None
        or section_data.semester is not None
    ):
        dup = db.query(ClassSection).filter(
            ClassSection.department == target_dept,
            ClassSection.academic_year == target_year,
            ClassSection.semester == target_sem,
            ClassSection.name == target_name,
            ClassSection.id != section_id,
        ).first()
        if dup:
            raise HTTPException(
                status_code=409,
                detail=f"Section '{target_name}' already in use in department '{target_dept}' (Year {target_year}, Semester {target_sem})",
            )

    if name_clean is not None:
        sec.name = name_clean
    if dept_clean is not None:
        sec.department = dept_clean
    if section_data.academic_year is not None:
        sec.academic_year = section_data.academic_year
    if section_data.semester is not None:
        sec.semester = section_data.semester
    if section_data.student_count is not None:
        if section_data.student_count < 1:
            raise HTTPException(status_code=400, detail="Student count must be a positive integer")
        sec.student_count = section_data.student_count
    if section_data.is_active is not None:
        sec.is_active = section_data.is_active

    try:
        db.commit()
        db.refresh(sec)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Section '{sec.name}' already in use in department '{sec.department}' (Year {sec.academic_year}, Semester {sec.semester})",
        )
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not update section")

    return {
        "message": "Section updated successfully",
        "id": sec.id,
        "name": sec.name,
        "department": sec.department,
        "academic_year": sec.academic_year,
        "semester": sec.semester,
        "student_count": getattr(sec, "student_count", 60) or 60,
        "is_active": sec.is_active,
    }


@app.delete("/api/sections/{section_id}")
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    sec = db.query(ClassSection).filter(ClassSection.id == section_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="Section not found")

    # Safeguard: prevent accidental deletion of records referenced by course requirements
    active_offerings = db.query(CourseOffering).filter(CourseOffering.class_id == section_id).all()
    if active_offerings:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete section '{sec.name}': currently referenced by "
                f"{len(active_offerings)} course requirement(s). "
                f"Remove or reassign the course requirements before deleting this section."
            ),
        )

    try:
        db.delete(sec)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete section")

    return {"message": f"Section '{sec.name}' deleted successfully", "id": section_id}


# -------------------- Subject APIs --------------------
@app.post("/api/subjects", status_code=201)
def create_subject(
    subject_data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    code_clean = subject_data.code.strip().upper()
    name_clean = subject_data.name.strip()
    dept_clean = subject_data.department.strip()

    if not code_clean:
        raise HTTPException(status_code=400, detail="Subject code cannot be empty")
    if not name_clean:
        raise HTTPException(status_code=400, detail="Subject name cannot be empty")
    if not dept_clean:
        raise HTTPException(status_code=400, detail="Department cannot be empty")

    if db.query(Subject).filter(Subject.code == code_clean).first():
        raise HTTPException(status_code=409, detail=f"Subject code '{code_clean}' already exists")
    subject = Subject(code=code_clean, name=name_clean, department=dept_clean)
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
    mappings = db.query(FacultySubject).all()
    offerings = db.query(CourseOffering).all()

    qual_count: dict[int, int] = {}
    for m in mappings:
        qual_count[m.subject_id] = qual_count.get(m.subject_id, 0) + 1

    off_count: dict[int, int] = {}
    for o in offerings:
        off_count[o.subject_id] = off_count.get(o.subject_id, 0) + 1

    return [
        {
            "id": s.id,
            "code": s.code,
            "name": s.name,
            "department": s.department,
            "qualifications_count": qual_count.get(s.id, 0),
            "offerings_count": off_count.get(s.id, 0),
        }
        for s in subjects
    ]


@app.get("/api/subjects/{subject_id}")
def get_subject(subject_id: int, db: Session = Depends(get_db)):
    sub = db.query(Subject).filter(Subject.id == subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")

    mappings = db.query(FacultySubject).filter(FacultySubject.subject_id == subject_id).all()
    offerings = db.query(CourseOffering).filter(CourseOffering.subject_id == subject_id).all()

    return {
        "id": sub.id,
        "code": sub.code,
        "name": sub.name,
        "department": sub.department,
        "qualifications_count": len(mappings),
        "offerings_count": len(offerings),
    }


@app.put("/api/subjects/{subject_id}")
def update_subject(
    subject_id: int,
    subject_data: SubjectUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    sub = db.query(Subject).filter(Subject.id == subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")

    if subject_data.code is not None:
        code_clean = subject_data.code.strip().upper()
        if not code_clean:
            raise HTTPException(status_code=400, detail="Subject code cannot be empty")
        if code_clean != sub.code:
            if db.query(Subject).filter(Subject.code == code_clean, Subject.id != subject_id).first():
                raise HTTPException(status_code=409, detail=f"Subject code '{code_clean}' already in use")
            sub.code = code_clean

    if subject_data.name is not None:
        name_clean = subject_data.name.strip()
        if not name_clean:
            raise HTTPException(status_code=400, detail="Subject name cannot be empty")
        sub.name = name_clean

    if subject_data.department is not None:
        dept_clean = subject_data.department.strip()
        if not dept_clean:
            raise HTTPException(status_code=400, detail="Department cannot be empty")
        sub.department = dept_clean

    try:
        db.commit()
        db.refresh(sub)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not update subject")

    return {
        "message": "Subject updated successfully",
        "id": sub.id,
        "code": sub.code,
        "name": sub.name,
        "department": sub.department,
    }


@app.delete("/api/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    sub = db.query(Subject).filter(Subject.id == subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Safeguard: prevent accidental deletion if referenced by course requirements
    active_offerings = db.query(CourseOffering).filter(CourseOffering.subject_id == subject_id).all()
    if active_offerings:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete subject '{sub.code}': currently referenced by "
                f"{len(active_offerings)} course requirement(s). "
                f"Remove or reassign the course requirements before deleting this subject."
            ),
        )

    try:
        # Delete associated qualification mappings first
        db.query(FacultySubject).filter(FacultySubject.subject_id == subject_id).delete()
        db.delete(sub)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete subject")

    return {"message": f"Subject '{sub.code}' deleted successfully", "id": subject_id}


# -------------------- Rooms APIs --------------------
@app.post("/api/rooms", status_code=201)
def create_room(
    room_data: RoomCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    name_clean = room_data.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Room name cannot be empty")
    if room_data.capacity <= 0:
        raise HTTPException(status_code=400, detail="Room capacity must be greater than zero")
    norm_type = room_data.room_type.strip().lower()
    if norm_type in ("classroom", "lecture_hall", "lecture"):
        norm_type = "classroom"
    elif norm_type in ("lab", "laboratory"):
        norm_type = "lab"
    else:
        raise HTTPException(
            status_code=400,
            detail="Room type must be classroom or lab",
        )
    bldg_clean = room_data.building.strip() if room_data.building else None
    bldg_filter = Room.building == bldg_clean if bldg_clean else Room.building.is_(None)
    if db.query(Room).filter(Room.name == name_clean, bldg_filter).first():
        bldg_name = bldg_clean or "Default Building"
        raise HTTPException(status_code=409, detail=f"Room name '{name_clean}' already exists in '{bldg_name}'")
    room = Room(
        name=name_clean, room_type=norm_type,
        capacity=room_data.capacity, building=bldg_clean,
        is_active=room_data.is_active,
    )
    try:
        db.add(room)
        db.commit()
        db.refresh(room)
    except IntegrityError:
        db.rollback()
        bldg_name = bldg_clean or "Default Building"
        raise HTTPException(status_code=409, detail=f"Room name '{name_clean}' already exists in '{bldg_name}'")
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


@app.get("/api/rooms/{room_id}")
def get_room(room_id: int, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "id": room.id, "name": room.name, "room_type": room.room_type,
        "capacity": room.capacity, "building": room.building, "is_active": room.is_active,
    }


@app.put("/api/rooms/{room_id}")
def update_room(
    room_id: int,
    room_data: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    name_clean = room_data.name.strip() if room_data.name is not None else None
    if name_clean is not None and not name_clean:
        raise HTTPException(status_code=400, detail="Room name cannot be empty")

    target_name = name_clean if name_clean is not None else room.name
    target_bldg = (room_data.building.strip() or None) if room_data.building is not None else room.building

    if room_data.name is not None or room_data.building is not None:
        bldg_filter = Room.building == target_bldg if target_bldg else Room.building.is_(None)
        if db.query(Room).filter(Room.name == target_name, bldg_filter, Room.id != room_id).first():
            bldg_name = target_bldg or "Default Building"
            raise HTTPException(status_code=409, detail=f"Room name '{target_name}' already exists in '{bldg_name}'")

    if name_clean is not None:
        room.name = name_clean
    if room_data.building is not None:
        room.building = target_bldg

    if room_data.room_type is not None:
        norm_type = room_data.room_type.strip().lower()
        if norm_type in ("classroom", "lecture_hall", "lecture"):
            norm_type = "classroom"
        elif norm_type in ("lab", "laboratory"):
            norm_type = "lab"
        else:
            raise HTTPException(status_code=400, detail="Room type must be classroom or lab")
        room.room_type = norm_type

    if room_data.capacity is not None:
        if room_data.capacity <= 0:
            raise HTTPException(status_code=400, detail="Room capacity must be greater than zero")
        room.capacity = room_data.capacity

    if room_data.is_active is not None:
        room.is_active = room_data.is_active

    try:
        db.commit()
        db.refresh(room)
    except IntegrityError:
        db.rollback()
        bldg_name = room.building or "Default Building"
        raise HTTPException(status_code=409, detail=f"Room name '{room.name}' already in use in '{bldg_name}'")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not update room")

    return {
        "message": "Room updated successfully",
        "id": room.id,
        "name": room.name,
        "room_type": room.room_type,
        "capacity": room.capacity,
        "building": room.building,
        "is_active": room.is_active,
    }


@app.delete("/api/rooms/{room_id}")
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    try:
        db.delete(room)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete room")

    return {"message": f"Room '{room.name}' deleted successfully", "id": room_id}


@app.get("/api/rooms/{room_id}/schedule")
def get_room_schedule(room_id: int, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    entries = (
        db.query(PublishedTimetableEntry)
        .join(PublishedTimetable, PublishedTimetableEntry.timetable_id == PublishedTimetable.id)
        .filter(
            PublishedTimetableEntry.room_id == room_id,
            PublishedTimetable.is_active.is_(True),
        )
        .all()
    )

    schedule = [
        {
            "id": e.id,
            "day": e.day,
            "period": e.period,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "class_id": e.class_id,
            "class_name": e.class_name,
            "department": e.department,
            "semester": e.semester,
            "subject_id": e.subject_id,
            "subject_code": e.subject_code,
            "subject_name": e.subject_name,
            "faculty_id": e.faculty_id,
            "faculty_name": e.faculty_name,
            "room_id": e.room_id,
            "room_name": e.room_name,
            "room_type": e.room_type,
            "occurrence": e.occurrence,
        }
        for e in entries
    ]

    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}
    schedule.sort(key=lambda row: (
        day_rank.get(row["day"], 99),
        _to_minutes(row["start_time"]),
    ))

    return {
        "room_id": room.id,
        "room_name": room.name,
        "room_type": room.room_type,
        "capacity": room.capacity,
        "building": room.building,
        "is_active": room.is_active,
        "scheduled_sessions_count": len(schedule),
        "schedule": schedule,
    }


# -------------------- Course Offerings APIs --------------------
@app.post("/api/course-offerings", status_code=201)
def create_course_offering(
    offering_data: CourseOfferingCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if offering_data.weekly_periods < 1:
        raise HTTPException(status_code=400, detail="Weekly periods must be at least 1")
    section = db.query(ClassSection).filter(
        ClassSection.id == offering_data.class_id,
        ClassSection.is_active.is_(True),
    ).first()
    if not section:
        raise HTTPException(status_code=404, detail="Active class section not found")
    subject = db.query(Subject).filter(Subject.id == offering_data.subject_id).first()
    if not subject:
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
        raise HTTPException(status_code=409, detail=f"Subject '{subject.code}' is already assigned to section '{section.name}'")

    # Faculty-Subject Qualification Validation:
    # If qualifications exist in the system for this subject, verify this faculty has the qualification
    subject_quals = db.query(FacultySubject).filter(FacultySubject.subject_id == offering_data.subject_id).all()
    if subject_quals:
        qualified_fac_ids = {q.faculty_id for q in subject_quals}
        if offering_data.faculty_id not in qualified_fac_ids:
            qualified_names = [f.name for f in db.query(Faculty).filter(Faculty.id.in_(qualified_fac_ids)).all()]
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Faculty '{faculty.name}' is not qualified to teach subject '{subject.code}: {subject.name}'. "
                    f"Qualified faculty: {', '.join(qualified_names) if qualified_names else 'None registered'}. "
                    f"Please map this faculty member to the subject first in Faculty-Subject Mappings."
                ),
            )

    offering = CourseOffering(
        class_id=offering_data.class_id, subject_id=offering_data.subject_id,
        faculty_id=offering_data.faculty_id, weekly_periods=offering_data.weekly_periods,
        requires_lab=offering_data.requires_lab,
    )
    try:
        db.add(offering)
        db.commit()
        db.refresh(offering)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Subject '{subject.code}' is already assigned to section '{section.name}' or violates constraints")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not create course offering")
    return {
        "message": "Course offering created successfully", "id": offering.id,
        "class_id": offering.class_id, "subject_id": offering.subject_id,
        "faculty_id": offering.faculty_id, "weekly_periods": offering.weekly_periods,
        "requires_lab": offering.requires_lab,
        "class_name": section.name,
        "subject_code": subject.code,
        "subject_name": subject.name,
        "faculty_name": faculty.name,
    }


@app.get("/api/course-offerings")
def list_course_offerings(db: Session = Depends(get_db)):
    offerings = db.query(CourseOffering).order_by(
        CourseOffering.class_id, CourseOffering.subject_id,
    ).all()

    sections_map = {s.id: s for s in db.query(ClassSection).all()}
    subjects_map = {s.id: s for s in db.query(Subject).all()}
    faculty_map = {f.id: f for f in db.query(Faculty).all()}

    return [
        {
            "id": o.id,
            "class_id": o.class_id,
            "class_name": sections_map.get(o.class_id).name if o.class_id in sections_map else f"Section {o.class_id}",
            "department": sections_map.get(o.class_id).department if o.class_id in sections_map else "Unknown",
            "semester": sections_map.get(o.class_id).semester if o.class_id in sections_map else 1,
            "subject_id": o.subject_id,
            "subject_code": subjects_map.get(o.subject_id).code if o.subject_id in subjects_map else f"SUBJ-{o.subject_id}",
            "subject_name": subjects_map.get(o.subject_id).name if o.subject_id in subjects_map else "Unknown",
            "faculty_id": o.faculty_id,
            "faculty_name": faculty_map.get(o.faculty_id).name if o.faculty_id in faculty_map else f"Faculty {o.faculty_id}",
            "weekly_periods": o.weekly_periods,
            "requires_lab": o.requires_lab,
        }
        for o in offerings
    ]


@app.get("/api/course-offerings/{offering_id}")
def get_course_offering(offering_id: int, db: Session = Depends(get_db)):
    off = db.query(CourseOffering).filter(CourseOffering.id == offering_id).first()
    if not off:
        raise HTTPException(status_code=404, detail="Course offering not found")

    sec = db.query(ClassSection).filter(ClassSection.id == off.class_id).first()
    sub = db.query(Subject).filter(Subject.id == off.subject_id).first()
    fac = db.query(Faculty).filter(Faculty.id == off.faculty_id).first()

    return {
        "id": off.id,
        "class_id": off.class_id,
        "class_name": sec.name if sec else "Unknown",
        "subject_id": off.subject_id,
        "subject_code": sub.code if sub else "Unknown",
        "subject_name": sub.name if sub else "Unknown",
        "faculty_id": off.faculty_id,
        "faculty_name": fac.name if fac else "Unknown",
        "weekly_periods": off.weekly_periods,
        "requires_lab": off.requires_lab,
    }


@app.put("/api/course-offerings/{offering_id}")
def update_course_offering(
    offering_id: int,
    offering_data: CourseOfferingUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    off = db.query(CourseOffering).filter(CourseOffering.id == offering_id).first()
    if not off:
        raise HTTPException(status_code=404, detail="Course offering not found")

    target_class_id = offering_data.class_id if offering_data.class_id is not None else off.class_id
    target_subject_id = offering_data.subject_id if offering_data.subject_id is not None else off.subject_id
    target_faculty_id = offering_data.faculty_id if offering_data.faculty_id is not None else off.faculty_id

    # Validate section exists and is active
    sec = db.query(ClassSection).filter(ClassSection.id == target_class_id).first()
    if not sec or not sec.is_active:
        raise HTTPException(status_code=404, detail="Target active class section not found")

    # Validate subject exists
    sub = db.query(Subject).filter(Subject.id == target_subject_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Target subject not found")

    # Validate faculty exists and is active
    fac = db.query(Faculty).filter(Faculty.id == target_faculty_id).first()
    if not fac or not fac.is_active:
        raise HTTPException(status_code=404, detail="Target active faculty member not found")

    # Check pair uniqueness if class or subject changed
    if (target_class_id != off.class_id or target_subject_id != off.subject_id):
        existing_pair = db.query(CourseOffering).filter(
            CourseOffering.class_id == target_class_id,
            CourseOffering.subject_id == target_subject_id,
            CourseOffering.id != offering_id,
        ).first()
        if existing_pair:
            raise HTTPException(status_code=409, detail=f"Subject '{sub.code}' is already assigned to section '{sec.name}'")

    # Check qualification
    subject_quals = db.query(FacultySubject).filter(FacultySubject.subject_id == target_subject_id).all()
    if subject_quals:
        qualified_fac_ids = {q.faculty_id for q in subject_quals}
        if target_faculty_id not in qualified_fac_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Faculty '{fac.name}' is not qualified to teach subject '{sub.code}: {sub.name}'.",
            )

    off.class_id = target_class_id
    off.subject_id = target_subject_id
    off.faculty_id = target_faculty_id
    if offering_data.weekly_periods is not None:
        if offering_data.weekly_periods < 1:
            raise HTTPException(status_code=400, detail="Weekly periods must be at least 1")
        off.weekly_periods = offering_data.weekly_periods
    if offering_data.requires_lab is not None:
        off.requires_lab = offering_data.requires_lab

    try:
        db.commit()
        db.refresh(off)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Subject '{sub.code}' is already assigned to section '{sec.name}' or violates constraints")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not update course offering")

    return {
        "message": "Course offering updated successfully",
        "id": off.id,
        "class_id": off.class_id,
        "subject_id": off.subject_id,
        "faculty_id": off.faculty_id,
        "weekly_periods": off.weekly_periods,
        "requires_lab": off.requires_lab,
    }


@app.delete("/api/course-offerings/{offering_id}")
def delete_course_offering(
    offering_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    off = db.query(CourseOffering).filter(CourseOffering.id == offering_id).first()
    if not off:
        raise HTTPException(status_code=404, detail="Course offering not found")

    try:
        db.delete(off)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete course offering")

    return {"message": "Course offering deleted successfully", "id": offering_id}


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
def list_timetable_configurations(department: str | None = None, db: Session = Depends(get_db)):
    query = db.query(TimetableConfig)
    if department:
        query = query.filter(TimetableConfig.department == department.strip())
    configs = query.order_by(TimetableConfig.semester.asc()).all()
    return [
        {
            "id": c.id,
            "department": c.department,
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
def get_timetable_configuration(semester: int, department: str | None = None, db: Session = Depends(get_db)):
    if not 1 <= semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8.")

    query = db.query(TimetableConfig).filter(TimetableConfig.semester == semester)
    if department:
        dept_clean = department.strip()
        config = query.filter(TimetableConfig.department == dept_clean).first()
        if not config:
            config = query.filter(TimetableConfig.department.is_(None)).first()
    else:
        config = query.first()

    if config:
        return {
            "id": config.id,
            "department": config.department,
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
        "department": department.strip() if department else None,
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
    department: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if not 1 <= semester <= 8:
        raise HTTPException(status_code=400, detail="Semester must be between 1 and 8.")

    dept_target = data.department.strip() if data.department else (department.strip() if department else None)

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

    config_query = db.query(TimetableConfig).filter(TimetableConfig.semester == semester)
    if dept_target:
        config = config_query.filter(TimetableConfig.department == dept_target).first()
    else:
        config = config_query.filter(TimetableConfig.department.is_(None)).first()

    if config:
        config.days = serialized_days
        config.working_hours_start = start_wh
        config.working_hours_end = end_wh
        config.period_duration = data.period_duration
        config.transition_duration = data.transition_duration
        config.breaks = serialized_breaks
        config.lunch_break = serialized_lunch
        config.is_active = data.is_active
        config.updated_at = datetime.now(timezone.utc)
    else:
        config = TimetableConfig(
            department=dept_target,
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
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Configuration for semester {semester} in department '{dept_target or 'Default'}' already exists.",
        ) from exc
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
    current_user: dict = Depends(require_admin),
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
    faculty_map = {f.id: f for f in db.query(Faculty).all()}
    subject_map = {s.id: s for s in db.query(Subject).all()}

    return [
        {
            "id": m.id,
            "faculty_id": m.faculty_id,
            "subject_id": m.subject_id,
            "faculty_name": faculty_map.get(m.faculty_id).name if m.faculty_id in faculty_map else f"Faculty {m.faculty_id}",
            "employee_id": faculty_map.get(m.faculty_id).employee_id if m.faculty_id in faculty_map else "",
            "subject_code": subject_map.get(m.subject_id).code if m.subject_id in subject_map else f"SUBJ-{m.subject_id}",
            "subject_name": subject_map.get(m.subject_id).name if m.subject_id in subject_map else "",
        }
        for m in mappings
    ]


@app.post("/api/faculty-subjects", status_code=201)
def create_faculty_subject(
    payload: FacultySubjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    faculty = db.query(Faculty).filter(Faculty.id == payload.faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")
    subject = db.query(Subject).filter(Subject.id == payload.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    existing = db.query(FacultySubject).filter(
        FacultySubject.faculty_id == payload.faculty_id,
        FacultySubject.subject_id == payload.subject_id,
    ).first()
    if existing:
        return {
            "message": "Faculty qualification already exists",
            "id": existing.id,
            "faculty_id": existing.faculty_id,
            "subject_id": existing.subject_id,
            "faculty_name": faculty.name,
            "subject_code": subject.code,
            "subject_name": subject.name,
        }

    mapping = FacultySubject(faculty_id=payload.faculty_id, subject_id=payload.subject_id)
    try:
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not assign qualification")

    return {
        "message": f"Mapped '{subject.name}' to '{faculty.name}' successfully",
        "id": mapping.id,
        "faculty_id": mapping.faculty_id,
        "subject_id": mapping.subject_id,
        "faculty_name": faculty.name,
        "subject_code": subject.code,
        "subject_name": subject.name,
    }


@app.delete("/api/faculty-subjects/{mapping_id}")
def delete_faculty_subject_by_id(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    mapping = db.query(FacultySubject).filter(FacultySubject.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Qualification mapping not found")

    # Safeguard: prevent removing qualification if faculty is actively teaching this subject
    active_offering = db.query(CourseOffering).filter(
        CourseOffering.faculty_id == mapping.faculty_id,
        CourseOffering.subject_id == mapping.subject_id,
    ).first()
    if active_offering:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot remove qualification: faculty member is actively assigned to teach this "
                "subject in an active course offering. Reassign or delete the offering first."
            ),
        )

    try:
        db.delete(mapping)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete qualification mapping")

    return {"message": "Qualification mapping removed successfully", "id": mapping_id}


# -------------------- Faculty Availability APIs --------------------
@app.get("/api/faculty-availability")
def list_faculty_availability(
    faculty_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(FacultyAvailability)
    if faculty_id is not None:
        query = query.filter(FacultyAvailability.faculty_id == faculty_id)
    records = query.all()

    faculty_map = {f.id: f for f in db.query(Faculty).all()}
    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}

    result = [
        {
            "id": r.id,
            "faculty_id": r.faculty_id,
            "faculty_name": faculty_map.get(r.faculty_id).name if r.faculty_id in faculty_map else "Unknown",
            "employee_id": faculty_map.get(r.faculty_id).employee_id if r.faculty_id in faculty_map else "",
            "day": r.day,
            "start_time": r.start_time,
            "end_time": r.end_time,
            "is_available": r.is_available,
            "reason": r.reason,
        }
        for r in records
    ]
    result.sort(key=lambda x: (
        day_rank.get(x["day"], 99),
        _to_minutes(x["start_time"]),
    ))
    return result


@app.get("/api/faculty/{faculty_id}/availability")
def get_faculty_availability(
    faculty_id: int,
    db: Session = Depends(get_db),
):
    faculty = db.query(Faculty).filter(Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    records = db.query(FacultyAvailability).filter(FacultyAvailability.faculty_id == faculty_id).all()
    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}

    result = [
        {
            "id": r.id,
            "faculty_id": r.faculty_id,
            "faculty_name": faculty.name,
            "employee_id": faculty.employee_id,
            "day": r.day,
            "start_time": r.start_time,
            "end_time": r.end_time,
            "is_available": r.is_available,
            "reason": r.reason,
        }
        for r in records
    ]
    result.sort(key=lambda x: (
        day_rank.get(x["day"], 99),
        _to_minutes(x["start_time"]),
    ))
    return result


@app.post("/api/faculty-availability", status_code=201)
def create_faculty_availability(
    payload: FacultyAvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    faculty = db.query(Faculty).filter(Faculty.id == payload.faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    day_clean = payload.day.strip().capitalize()
    if day_clean not in VALID_DAYS:
        raise HTTPException(status_code=400, detail=f"Invalid day '{payload.day}'. Valid days: {', '.join(VALID_DAYS)}")

    try:
        t_start = _to_minutes(payload.start_time)
        t_end = _to_minutes(payload.end_time)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM format.")

    if t_start >= t_end:
        raise HTTPException(status_code=400, detail="start_time must be strictly earlier than end_time")

    record = FacultyAvailability(
        faculty_id=payload.faculty_id,
        day=day_clean,
        start_time=payload.start_time.strip(),
        end_time=payload.end_time.strip(),
        is_available=payload.is_available,
        reason=payload.reason.strip() if payload.reason else None,
    )
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Faculty availability violates database constraints")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save faculty availability")

    return {
        "message": f"Availability block for '{faculty.name}' on {record.day} saved successfully",
        "id": record.id,
        "faculty_id": record.faculty_id,
        "faculty_name": faculty.name,
        "day": record.day,
        "start_time": record.start_time,
        "end_time": record.end_time,
        "is_available": record.is_available,
        "reason": record.reason,
    }


@app.delete("/api/faculty-availability/{availability_id}")
def delete_faculty_availability(
    availability_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    record = db.query(FacultyAvailability).filter(FacultyAvailability.id == availability_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Faculty availability record not found")

    try:
        db.delete(record)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete faculty availability record")

    return {"message": "Faculty availability record removed successfully", "id": availability_id}


# -------------------- Bulk CSV Import API --------------------
EMAIL_REGEX = re.compile(r"^[\w\.\+\-]+@[\w\-]+\.[a-zA-Z0-9\.\-]+$")


@app.post("/api/import/csv")
def import_csv_data(
    payload: CsvImportRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    content = payload.csv_content.lstrip("\ufeff").strip()
    if not content:
        raise HTTPException(status_code=400, detail="CSV content is empty.")

    reader = csv.reader(io.StringIO(content))
    try:
        raw_headers = next(reader)
    except StopIteration:
        raise HTTPException(status_code=400, detail="CSV file contains no rows.")

    headers = [h.strip().lower().replace(" ", "_") for h in raw_headers]
    header_set = set(headers)

    valid_rows = []
    invalid_rows = []
    seen_keys = set()

    # Pre-fetch existing data for duplicate & reference checking
    existing_sections = {s.name.lower(): s for s in db.query(ClassSection).all()}
    existing_sections_by_id = {s.id: s for s in db.query(ClassSection).all()}
    existing_subjects = {s.code.lower(): s for s in db.query(Subject).all()}
    existing_subjects_by_id = {s.id: s for s in db.query(Subject).all()}
    existing_faculty = {f.employee_id.lower(): f for f in db.query(Faculty).all()}
    existing_faculty_by_id = {f.id: f for f in db.query(Faculty).all()}
    existing_faculty_emails = {f.email.lower(): f for f in db.query(Faculty).all()}
    existing_rooms = {r.name.lower(): r for r in db.query(Room).all()}
    existing_rooms_by_id = {r.id: r for r in db.query(Room).all()}
    existing_mappings = {(m.faculty_id, m.subject_id): m for m in db.query(FacultySubject).all()}
    existing_offerings = {(o.class_id, o.subject_id): o for o in db.query(CourseOffering).all()}

    row_index = 1
    for raw_row in reader:
        row_index += 1
        if not any(cell.strip() for cell in raw_row):
            continue  # Skip blank lines

        row_dict = {}
        for idx, h in enumerate(headers):
            row_dict[h] = raw_row[idx].strip() if idx < len(raw_row) else ""

        errors = []

        if payload.entity == "sections":
            # Support Sample_Dataset (class_id,programme,semester,section,student_count) or standard (name,department,academic_year,semester)
            if "class_id" in header_set:
                name = row_dict.get("class_id", "")
                dept = row_dict.get("programme") or row_dict.get("department") or "Computer Science"
                sem_str = row_dict.get("semester", "1")
                sec_label = row_dict.get("section", "")
                if sec_label and sec_label.lower() not in name.lower():
                    name = f"{name}-{sec_label}"
            else:
                name = row_dict.get("name") or row_dict.get("section_name", "")
                dept = row_dict.get("department", "Computer Science")
                sem_str = row_dict.get("semester", "1")

            if not name:
                errors.append("Section name/class_id is required.")
            try:
                semester = int(sem_str)
                if not 1 <= semester <= 8:
                    errors.append(f"Semester must be between 1 and 8 (got {semester}).")
            except ValueError:
                errors.append(f"Invalid integer for semester: '{sem_str}'.")
                semester = 1

            year_str = row_dict.get("academic_year")
            if year_str:
                try:
                    year = int(year_str)
                    if not 1 <= year <= 4:
                        errors.append(f"Academic year must be between 1 and 4 (got {year}).")
                except ValueError:
                    errors.append(f"Invalid integer for academic_year: '{year_str}'.")
                    year = ((semester - 1) // 2) + 1
            else:
                year = max(1, min(4, ((semester - 1) // 2) + 1))

            student_count_str = row_dict.get("student_count")
            if student_count_str:
                try:
                    sc = int(student_count_str)
                    if sc < 1:
                        errors.append(f"Student count must be positive integer (got {sc}).")
                    student_count_val = max(1, sc)
                except ValueError:
                    errors.append(f"Invalid integer for student_count: '{student_count_str}'.")
                    student_count_val = 60
            else:
                student_count_val = 60

            key = name.lower()
            if key in seen_keys:
                errors.append(f"Duplicate section name in CSV: '{name}'.")
            elif key in existing_sections:
                errors.append(f"Section '{name}' already exists in the database.")
            seen_keys.add(key)

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {
                        "name": name,
                        "department": dept,
                        "academic_year": year,
                        "semester": semester,
                        "student_count": student_count_val,
                        "is_active": True,
                    },
                })

        elif payload.entity == "subjects":
            # Support Sample_Dataset (subject_id,subject_name,subject_type,periods_per_week,duration_periods,required_room_type) or standard (code,name,department)
            code = (row_dict.get("code") or row_dict.get("subject_id", "")).upper()
            name = row_dict.get("name") or row_dict.get("subject_name", "")
            dept = row_dict.get("department") or row_dict.get("programme") or "Computer Science"

            if not code:
                errors.append("Subject code / subject_id is required.")
            if not name:
                errors.append("Subject name is required.")

            key = code.lower()
            if key in seen_keys:
                errors.append(f"Duplicate subject code in CSV: '{code}'.")
            elif key in existing_subjects:
                errors.append(f"Subject code '{code}' already exists in the database.")
            seen_keys.add(key)

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {"code": code, "name": name, "department": dept},
                })

        elif payload.entity == "faculty":
            # Support Sample_Dataset (faculty_id,faculty_name,max_periods_per_week,max_periods_per_day) or standard (employee_id,name,email,department)
            emp_id = (row_dict.get("employee_id") or row_dict.get("faculty_id", "")).upper()
            name = row_dict.get("name") or row_dict.get("faculty_name", "")
            dept = row_dict.get("department", "Computer Science")
            email = row_dict.get("email", "")

            if not emp_id:
                errors.append("Faculty ID / employee_id is required.")
            if not name:
                errors.append("Faculty name is required.")

            if not email:
                email = f"{emp_id.lower().replace('-', '')}@university.edu"
            elif not EMAIL_REGEX.match(email):
                errors.append(f"Invalid email address: '{email}'.")

            key = emp_id.lower()
            if key in seen_keys:
                errors.append(f"Duplicate employee ID in CSV: '{emp_id}'.")
            elif key in existing_faculty:
                errors.append(f"Employee ID '{emp_id}' already exists in database.")
            seen_keys.add(key)

            if email.lower() in existing_faculty_emails:
                errors.append(f"Email '{email}' already registered to another faculty member.")

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {
                        "employee_id": emp_id,
                        "name": name,
                        "email": email,
                        "department": dept,
                        "is_active": True,
                    },
                })

        elif payload.entity == "rooms":
            # Support Sample_Dataset (room_id,room_name,room_type,capacity) or standard (name,room_type,capacity,building)
            name = row_dict.get("name") or row_dict.get("room_name") or row_dict.get("room_id", "")
            raw_type = (row_dict.get("room_type") or "classroom").strip().lower()
            cap_str = row_dict.get("capacity", "60")
            building = row_dict.get("building") or "Main Campus"

            if not name:
                errors.append("Room name is required.")

            norm_type = "classroom"
            if raw_type in ("lab", "laboratory"):
                norm_type = "lab"
            elif raw_type in ("classroom", "lecture_hall", "lecture"):
                norm_type = "classroom"
            else:
                errors.append(f"Invalid room type: '{raw_type}'. Must be classroom or lab.")

            try:
                capacity = int(cap_str)
                if capacity <= 0:
                    errors.append(f"Capacity must be greater than zero (got {capacity}).")
            except ValueError:
                errors.append(f"Invalid integer for capacity: '{cap_str}'.")
                capacity = 60

            key = name.lower()
            if key in seen_keys:
                errors.append(f"Duplicate room name in CSV: '{name}'.")
            elif key in existing_rooms:
                errors.append(f"Room '{name}' already exists in database.")
            seen_keys.add(key)

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {
                        "name": name,
                        "room_type": norm_type,
                        "capacity": capacity,
                        "building": building,
                        "is_active": True,
                    },
                })

        elif payload.entity == "faculty_subjects":
            fac_ref = row_dict.get("faculty_id") or row_dict.get("employee_id", "")
            sub_ref = row_dict.get("subject_id") or row_dict.get("subject_code", "")

            fac = None
            if fac_ref.isdigit() and int(fac_ref) in existing_faculty_by_id:
                fac = existing_faculty_by_id[int(fac_ref)]
            elif fac_ref.lower() in existing_faculty:
                fac = existing_faculty[fac_ref.lower()]
            else:
                errors.append(f"Faculty reference '{fac_ref}' does not match any registered faculty.")

            sub = None
            if sub_ref.isdigit() and int(sub_ref) in existing_subjects_by_id:
                sub = existing_subjects_by_id[int(sub_ref)]
            elif sub_ref.lower() in existing_subjects:
                sub = existing_subjects[sub_ref.lower()]
            else:
                errors.append(f"Subject reference '{sub_ref}' does not match any registered subject.")

            if fac and sub:
                pair = (fac.id, sub.id)
                if pair in seen_keys:
                    errors.append(f"Duplicate qualification mapping in CSV: Faculty {fac.name} -> Subject {sub.code}.")
                elif pair in existing_mappings:
                    errors.append(f"Qualification mapping already exists in database: Faculty {fac.name} -> Subject {sub.code}.")
                seen_keys.add(pair)

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {"faculty_id": fac.id, "subject_id": sub.id},
                    "display": {"faculty_name": fac.name, "subject_code": sub.code},
                })

        elif payload.entity == "requirements":
            # Support Sample_Dataset (class_id,subject_id,faculty_id,sessions_per_week,duration_periods) or standard (class_id,subject_id,faculty_id,weekly_periods,requires_lab)
            class_ref = row_dict.get("class_id") or row_dict.get("section", "")
            sub_ref = row_dict.get("subject_id") or row_dict.get("subject_code", "")
            fac_ref = row_dict.get("faculty_id") or row_dict.get("employee_id", "")

            # Resolve Section
            sec = None
            if class_ref.isdigit() and int(class_ref) in existing_sections_by_id:
                sec = existing_sections_by_id[int(class_ref)]
            elif class_ref.lower() in existing_sections:
                sec = existing_sections[class_ref.lower()]
            else:
                # Try partial match (e.g. CSE301 matches CSE301-A)
                matched_sec = next((s for k, s in existing_sections.items() if class_ref.lower() in k or k in class_ref.lower()), None)
                if matched_sec:
                    sec = matched_sec
                else:
                    errors.append(f"Class/Section '{class_ref}' not found in database.")

            # Resolve Subject
            sub = None
            if sub_ref.isdigit() and int(sub_ref) in existing_subjects_by_id:
                sub = existing_subjects_by_id[int(sub_ref)]
            elif sub_ref.lower() in existing_subjects:
                sub = existing_subjects[sub_ref.lower()]
            else:
                errors.append(f"Subject '{sub_ref}' not found in database.")

            # Resolve Faculty
            fac = None
            if fac_ref.isdigit() and int(fac_ref) in existing_faculty_by_id:
                fac = existing_faculty_by_id[int(fac_ref)]
            elif fac_ref.lower() in existing_faculty:
                fac = existing_faculty[fac_ref.lower()]
            else:
                errors.append(f"Faculty '{fac_ref}' not found in database.")

            # Resolve Periods
            sessions_str = row_dict.get("sessions_per_week") or row_dict.get("weekly_periods", "4")
            duration_str = row_dict.get("duration_periods", "1")
            try:
                sessions = int(sessions_str)
                duration = int(duration_str)
                total_periods = sessions * duration
                if not 1 <= total_periods <= 35:
                    errors.append(f"Total weekly periods must be between 1 and 35 (got {total_periods}).")
            except ValueError:
                errors.append(f"Invalid integers for periods: sessions='{sessions_str}', duration='{duration_str}'.")
                total_periods = 4

            req_lab = False
            raw_lab = row_dict.get("requires_lab") or row_dict.get("required_room_type", "")
            if raw_lab.lower() in ("true", "1", "yes", "lab"):
                req_lab = True
            elif sub and ("lab" in sub.name.lower() or sub.code.upper().endswith("L")):
                req_lab = True

            if sec and sub:
                pair = (sec.id, sub.id)
                if pair in seen_keys:
                    errors.append(f"Duplicate assignment in CSV: Subject {sub.code} for Section {sec.name}.")
                elif pair in existing_offerings:
                    errors.append(f"Course requirement already exists in database for Section {sec.name} and Subject {sub.code}.")
                seen_keys.add(pair)

            if errors:
                invalid_rows.append({"row": row_index, "data": row_dict, "errors": errors})
            else:
                valid_rows.append({
                    "row": row_index,
                    "model_data": {
                        "class_id": sec.id,
                        "subject_id": sub.id,
                        "faculty_id": fac.id,
                        "weekly_periods": total_periods,
                        "requires_lab": req_lab,
                    },
                    "display": {
                        "class_name": sec.name,
                        "subject_code": sub.code,
                        "faculty_name": fac.name,
                        "weekly_periods": total_periods,
                        "requires_lab": req_lab,
                    },
                })

    total_rows = len(valid_rows) + len(invalid_rows)

    # If preview_only is True, return validation analysis without committing
    if payload.preview_only:
        return {
            "entity": payload.entity,
            "total_rows": total_rows,
            "valid_count": len(valid_rows),
            "invalid_count": len(invalid_rows),
            "valid_rows": valid_rows,
            "invalid_rows": invalid_rows,
            "can_import": len(valid_rows) > 0 and len(invalid_rows) == 0,
            "summary": (
                f"Validation complete: {len(valid_rows)} valid row(s), {len(invalid_rows)} error(s) found out of {total_rows} total rows."
            ),
        }

    # Execute commit
    if not valid_rows:
        raise HTTPException(status_code=400, detail="Cannot import: no valid rows found.")
    if invalid_rows:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot import: {len(invalid_rows)} invalid rows must be corrected first.",
        )

    try:
        if payload.entity == "sections":
            for vr in valid_rows:
                db.add(ClassSection(**vr["model_data"]))
        elif payload.entity == "subjects":
            for vr in valid_rows:
                db.add(Subject(**vr["model_data"]))
        elif payload.entity == "faculty":
            for vr in valid_rows:
                db.add(Faculty(**vr["model_data"]))
        elif payload.entity == "rooms":
            for vr in valid_rows:
                db.add(Room(**vr["model_data"]))
        elif payload.entity == "faculty_subjects":
            for vr in valid_rows:
                db.add(FacultySubject(**vr["model_data"]))
        elif payload.entity == "requirements":
            for vr in valid_rows:
                db.add(CourseOffering(**vr["model_data"]))

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database import failed: {str(exc)}")

    return {
        "status": "success",
        "entity": payload.entity,
        "imported_count": len(valid_rows),
        "message": f"Successfully imported {len(valid_rows)} {payload.entity} records into the database.",
    }


# -------------------- Load Demo Data (Optional Explicit Action) --------------------
@app.post("/api/academic-data/load-demo-data")
def load_sample_dataset_demo_data(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Explicitly populates database from Sample_Dataset files ONLY when requested by the administrator.
    """
    import os
    from pathlib import Path

    sample_dir = Path(__file__).resolve().parents[2] / "Sample_Dataset"
    if not sample_dir.exists():
        raise HTTPException(status_code=404, detail="Sample_Dataset directory not found.")

    imported_summary = {}

    try:
        # 1. Classes
        classes_path = sample_dir / "classes.csv"
        if classes_path.exists():
            with open(classes_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    cid = r["class_id"].strip()
                    sec = r["section"].strip()
                    name = f"{cid}-{sec}" if sec and sec not in cid else cid
                    if not db.query(ClassSection).filter(ClassSection.name == name).first():
                        sem = int(r.get("semester", 1))
                        db.add(ClassSection(
                            name=name,
                            department=r.get("programme", "CSE"),
                            semester=sem,
                            academic_year=max(1, min(4, ((sem - 1) // 2) + 1)),
                            student_count=int(r.get("student_count", 60) or 60),
                            is_active=True,
                        ))
                        added += 1
                db.commit()
                imported_summary["sections"] = added

        # 2. Subjects
        sub_path = sample_dir / "subjects.csv"
        if sub_path.exists():
            with open(sub_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    code = r["subject_id"].strip().upper()
                    if not db.query(Subject).filter(Subject.code == code).first():
                        db.add(Subject(
                            code=code,
                            name=r["subject_name"].strip(),
                            department="CSE",
                        ))
                        added += 1
                db.commit()
                imported_summary["subjects"] = added

        # 3. Faculty
        fac_path = sample_dir / "faculty.csv"
        if fac_path.exists():
            with open(fac_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    fid = r["faculty_id"].strip()
                    if not db.query(Faculty).filter(Faculty.employee_id == fid).first():
                        db.add(Faculty(
                            employee_id=fid,
                            name=r["faculty_name"].strip(),
                            email=f"{fid.lower()}@optisched.edu",
                            department="CSE",
                            is_active=True,
                        ))
                        added += 1
                db.commit()
                imported_summary["faculty"] = added

        # 4. Rooms
        room_path = sample_dir / "rooms.csv"
        if room_path.exists():
            with open(room_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    rname = r.get("room_name", r.get("room_id", "")).strip()
                    if not db.query(Room).filter(Room.name == rname).first():
                        rtype = r.get("room_type", "classroom").strip().lower()
                        db.add(Room(
                            name=rname,
                            room_type="lab" if "lab" in rtype else "classroom",
                            capacity=int(r.get("capacity", 60)),
                            building="Academic Wing",
                            is_active=True,
                        ))
                        added += 1
                db.commit()
                imported_summary["rooms"] = added

        # 5. Faculty Subjects
        fs_path = sample_dir / "faculty_subjects.csv"
        if fs_path.exists():
            fac_by_code = {f.employee_id.lower(): f for f in db.query(Faculty).all()}
            sub_by_code = {s.code.lower(): s for s in db.query(Subject).all()}
            with open(fs_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    fid = r["faculty_id"].strip().lower()
                    sid = r["subject_id"].strip().lower()
                    if fid in fac_by_code and sid in sub_by_code:
                        f_obj = fac_by_code[fid]
                        s_obj = sub_by_code[sid]
                        if not db.query(FacultySubject).filter(
                            FacultySubject.faculty_id == f_obj.id,
                            FacultySubject.subject_id == s_obj.id,
                        ).first():
                            db.add(FacultySubject(faculty_id=f_obj.id, subject_id=s_obj.id))
                            added += 1
                db.commit()
                imported_summary["qualifications"] = added

        # 6. Requirements
        req_path = sample_dir / "requirements.csv"
        if req_path.exists():
            sec_by_name = {s.name.lower(): s for s in db.query(ClassSection).all()}
            fac_by_code = {f.employee_id.lower(): f for f in db.query(Faculty).all()}
            sub_by_code = {s.code.lower(): s for s in db.query(Subject).all()}
            with open(req_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                added = 0
                for r in reader:
                    cid = r["class_id"].strip().lower()
                    sid = r["subject_id"].strip().lower()
                    fid = r["faculty_id"].strip().lower()

                    sec = next((s for k, s in sec_by_name.items() if cid in k), None)
                    sub = sub_by_code.get(sid)
                    fac = fac_by_code.get(fid)

                    if sec and sub and fac:
                        if not db.query(CourseOffering).filter(
                            CourseOffering.class_id == sec.id,
                            CourseOffering.subject_id == sub.id,
                        ).first():
                            sessions = int(r.get("sessions_per_week", 4))
                            duration = int(r.get("duration_periods", 1))
                            is_lab = "lab" in sub.name.lower() or sub.code.endswith("L")
                            db.add(CourseOffering(
                                class_id=sec.id,
                                subject_id=sub.id,
                                faculty_id=fac.id,
                                weekly_periods=sessions * duration,
                                requires_lab=is_lab,
                            ))
                            added += 1
                db.commit()
                imported_summary["requirements"] = added

    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to load demo data: {str(exc)}")

    return {
        "status": "success",
        "message": "Demo sample dataset loaded successfully.",
        "imported": imported_summary,
    }


# -------------------- Independent Schedule Validator --------------------
def _validate_generated_schedule(
    schedule_rows: list[dict],
    offerings: list[CourseOffering],
    rooms_map: dict[int, Room],
    faculty_map: dict[int, Faculty],
    subject_map: dict[int, Subject],
    faculty_subjects_map: dict[int, set[int]],
    sections_map: dict[int, ClassSection] | None = None,
    blocked_intervals_map: dict[int, list[tuple[str, int, int]]] | None = None,
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

    # 2. Room eligibility and capacity check
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

        # 4. Room seating capacity check
        if sections_map and row["class_id"] in sections_map and row["room_id"] in rooms_map:
            sec = sections_map[row["class_id"]]
            rm = rooms_map[row["room_id"]]
            if sec.student_count is not None and rm.capacity < sec.student_count:
                eligibility_violations.append(
                    f"Room {rm.name} capacity ({rm.capacity}) is insufficient for section {sec.name} ({sec.student_count} students)"
                )

        # 5. Faculty availability check
        if blocked_intervals_map and row["faculty_id"] in blocked_intervals_map:
            unavails = blocked_intervals_map[row["faculty_id"]]
            r_day = row["day"].strip().lower()
            r_start, r_end = _to_minutes(row["start_time"]), _to_minutes(row["end_time"])
            for u_day, u_start, u_end in unavails:
                if r_day == u_day and max(r_start, u_start) < min(r_end, u_end):
                    faculty_clashes.append(
                        f"Faculty {row['faculty_name']} scheduled during unavailable block on {row['day']} ({row['start_time']}–{row['end_time']})"
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
    current_user: dict = Depends(require_authenticated),
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
            parsed_days = [DaySchedule.model_validate(d) for d in cfg.days]
            if cfg.department:
                saved_configs_raw[(cfg.department, cfg.semester)] = cfg
                saved_configs[(cfg.department, cfg.semester)] = parsed_days
            else:
                saved_configs_raw[cfg.semester] = cfg
                saved_configs[cfg.semester] = parsed_days

    section_slots: dict[int, list[dict]] = {}
    section_days: dict[int, list[DaySchedule]] = {}
    for section in sections:
        if request.days is not None:
            days_to_use = request.days
        elif (section.department, section.semester) in saved_configs:
            days_to_use = saved_configs[(section.department, section.semester)]
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
            if not lab_rooms:
                raise HTTPException(
                    status_code=400,
                    detail=f"No active laboratory room is available for lab subject {subject.code}.",
                )
            if section.student_count is not None:
                eligible_rooms = [r for r in lab_rooms if r.capacity >= section.student_count]
                if not eligible_rooms:
                    max_lab_cap = max((r.capacity for r in lab_rooms), default=0)
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"No active laboratory room has sufficient capacity for section '{section.name}' "
                            f"(requires {section.student_count} seats, maximum available lab capacity is {max_lab_cap})."
                        ),
                    )
            else:
                eligible_rooms = lab_rooms
        else:
            if not classroom_rooms:
                raise HTTPException(
                    status_code=400,
                    detail=f"No active classroom or lecture hall is available for non-lab subject {subject.code}.",
                )
            if section.student_count is not None:
                eligible_rooms = [r for r in classroom_rooms if r.capacity >= section.student_count]
                if not eligible_rooms:
                    max_class_cap = max((r.capacity for r in classroom_rooms), default=0)
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"No active classroom/lecture hall has sufficient capacity for section '{section.name}' "
                            f"(requires {section.student_count} seats, maximum available classroom capacity is {max_class_cap})."
                        ),
                    )
            else:
                eligible_rooms = classroom_rooms

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

    # Fetch faculty unavailable intervals for CP-SAT hard constraints
    blocked_avail = db.query(FacultyAvailability).filter(
        FacultyAvailability.is_available.is_(False)
    ).all()
    blocked_map: dict[int, list[tuple[str, int, int]]] = {}
    for b in blocked_avail:
        b_day = b.day.strip().lower()
        b_start = _to_minutes(b.start_time)
        b_end = _to_minutes(b.end_time)
        blocked_map.setdefault(b.faculty_id, []).append((b_day, b_start, b_end))

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
        unavail_intervals = blocked_map.get(fac.id, [])

        for slot_i, slot in enumerate(slots):
            slot_day = slot["day"].strip().lower()
            s_start = slot["start_minute"]
            s_end = slot["end_minute"]
            is_faculty_blocked = any(
                slot_day == u_day and max(s_start, u_start) < min(s_end, u_end)
                for u_day, u_start, u_end in unavail_intervals
            )

            for room in lesson["rooms"]:
                var = model.NewBoolVar(f"x_l{lesson_i}_s{slot_i}_r{room.id}")
                if is_faculty_blocked:
                    # Hard Constraint: Faculty cannot be scheduled in blocked/unavailable periods
                    model.Add(var == 0)

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
    t_start = time.perf_counter()
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.max_time_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    solve_duration = round(time.perf_counter() - t_start, 3)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        status_name = solver.StatusName(status)
        if status == cp_model.INFEASIBLE:
            detail = (
                f"No feasible timetable exists (Solver status: INFEASIBLE). "
                "The mathematical constraints cannot be satisfied simultaneously with the provided academic data. "
                "Verify room availability, faculty schedules, or reduce required weekly periods."
            )
        elif status == cp_model.UNKNOWN:
            detail = (
                f"Solver timed out before finding a feasible timetable (Solver status: UNKNOWN). "
                f"Time limit of {request.max_time_seconds}s reached without finding a conflict-free solution. "
                "Try allocating more search time or relaxing tight constraints."
            )
        elif status == cp_model.MODEL_INVALID:
            detail = "Constraint model definition was invalid (Solver status: MODEL_INVALID)."
        else:
            detail = f"Timetable generation could not find a feasible solution (Solver status: {status_name})."
        raise HTTPException(
            status_code=409,
            detail=detail,
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
        sections_map=section_map,
        blocked_intervals_map=blocked_map,
    )

    # Confirm that all required sessions are scheduled
    if len(result) != len(lessons):
        raise HTTPException(
            status_code=500,
            detail=(
                f"Integrity check failed: {len(lessons)} weekly period(s) required by curriculum, "
                f"but solver only scheduled {len(result)} period(s)."
            ),
        )

    # Reject invalid output if any clashes or eligibility violations exist
    if not validation_report["is_valid"]:
        clash_summary = []
        if validation_report["faculty_clashes"] > 0:
            clash_summary.append(f"{validation_report['faculty_clashes']} faculty double-booking(s)")
        if validation_report["room_clashes"] > 0:
            clash_summary.append(f"{validation_report['room_clashes']} room double-booking(s)")
        if validation_report["section_clashes"] > 0:
            clash_summary.append(f"{validation_report['section_clashes']} section double-booking(s)")
        if validation_report["eligibility_violations"] > 0:
            clash_summary.append(f"{validation_report['eligibility_violations']} qualification/suitability mismatch(es)")
        raise HTTPException(
            status_code=500,
            detail=f"Independent validation rejected generated timetable: {', '.join(clash_summary)}.",
        )

    # 10. Notes
    notes = [
        f"Working hours active: {working_hours_display}.",
        f"Scheduled session window: {scheduled_span}.",
        f"Solver solved in {solve_duration}s with status {solver.StatusName(status)}.",
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
        "solve_time_seconds": solve_duration,
        "required_sessions_count": len(lessons),
        "scheduled_sessions_count": len(result),
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


# -------------------- Timetable Publishing & Persistence APIs --------------------
@app.post("/api/timetable/publish", status_code=201)
def publish_timetable(
    request: TimetablePublishRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if not request.schedule:
        raise HTTPException(status_code=400, detail="Cannot publish an empty timetable schedule.")

    title_clean = request.title.strip()
    if not title_clean:
        raise HTTPException(status_code=400, detail="Timetable title cannot be empty.")

    # 1. Independent validation before publishing to prevent corrupt or conflicting schedules
    offerings = db.query(CourseOffering).all()
    rooms_map = {r.id: r for r in db.query(Room).all()}
    faculty_map = {f.id: f for f in db.query(Faculty).all()}
    subject_map = {s.id: s for s in db.query(Subject).all()}
    fs_map: dict[int, set[int]] = {}
    for fs in db.query(FacultySubject).all():
        fs_map.setdefault(fs.subject_id, set()).add(fs.faculty_id)

    sections_map = {s.id: s for s in db.query(ClassSection).all()}

    blocked_avail = db.query(FacultyAvailability).filter(FacultyAvailability.is_available.is_(False)).all()
    blocked_map: dict[int, list[tuple[str, int, int]]] = {}
    for b in blocked_avail:
        blocked_map.setdefault(b.faculty_id, []).append((b.day.strip().lower(), _to_minutes(b.start_time), _to_minutes(b.end_time)))

    validation_report = _validate_generated_schedule(
        schedule_rows=request.schedule,
        offerings=offerings,
        rooms_map=rooms_map,
        faculty_map=faculty_map,
        subject_map=subject_map,
        faculty_subjects_map=fs_map,
        sections_map=sections_map,
        blocked_intervals_map=blocked_map,
    )

    if not validation_report["is_valid"]:
        clash_summary = []
        if validation_report["faculty_clashes"] > 0:
            clash_summary.append(f"{validation_report['faculty_clashes']} faculty clash(es)")
        if validation_report["room_clashes"] > 0:
            clash_summary.append(f"{validation_report['room_clashes']} room clash(es)")
        if validation_report["section_clashes"] > 0:
            clash_summary.append(f"{validation_report['section_clashes']} section clash(es)")
        if validation_report["eligibility_violations"] > 0:
            clash_summary.append(f"{validation_report['eligibility_violations']} eligibility/capacity violation(s)")
        raise HTTPException(
            status_code=400,
            detail=f"Cannot publish schedule with unresolved conflicts: {', '.join(clash_summary)}.",
        )

    # Validate referential integrity of schedule entities before persisting
    for row in request.schedule:
        c_id = row.get("class_id")
        f_id = row.get("faculty_id")
        r_id = row.get("room_id")
        s_id = row.get("subject_id")
        if c_id not in sections_map:
            raise HTTPException(status_code=400, detail=f"Cannot publish schedule: referenced class_id {c_id} does not exist.")
        if f_id not in faculty_map:
            raise HTTPException(status_code=400, detail=f"Cannot publish schedule: referenced faculty_id {f_id} does not exist.")
        if r_id not in rooms_map:
            raise HTTPException(status_code=400, detail=f"Cannot publish schedule: referenced room_id {r_id} does not exist.")
        if s_id not in subject_map:
            raise HTTPException(status_code=400, detail=f"Cannot publish schedule: referenced subject_id {s_id} does not exist.")

    # 2. Versioning: Find previous version for this scope/class/semester to preserve historical records
    version_query = db.query(PublishedTimetable)
    if request.scope in {"class", "section"} and request.class_id:
        version_query = version_query.filter(PublishedTimetable.class_id == request.class_id)
    elif request.scope == "semester" and request.semester:
        version_query = version_query.filter(PublishedTimetable.semester == request.semester)
    elif request.scope == "department" and request.department:
        version_query = version_query.filter(PublishedTimetable.department == request.department)

    previous_versions = version_query.order_by(PublishedTimetable.version.desc()).all()
    next_version = (previous_versions[0].version + 1) if previous_versions else 1

    # Mark previous versions for this target scope as inactive (preserving history)
    for prev in previous_versions:
        prev.is_active = False

    publisher_name = current_user.get("user_id") or "Admin"

    # 3. Create PublishedTimetable record
    pub_table = PublishedTimetable(
        title=title_clean,
        version=next_version,
        scope=request.scope,
        class_id=request.class_id,
        department=request.department,
        semester=request.semester,
        working_hours=request.working_hours,
        solver_status=request.solver_status,
        solve_time_seconds=request.solve_time_seconds,
        sections_scheduled=request.sections_scheduled,
        weekly_sessions_scheduled=len(request.schedule),
        validation_summary=validation_report,
        notes=request.notes or [],
        is_active=True,
        published_by=publisher_name,
    )

    db.add(pub_table)
    db.flush()

    # 4. Insert all schedule entries
    for row in request.schedule:
        entry = PublishedTimetableEntry(
            timetable_id=pub_table.id,
            day=row["day"],
            period=row.get("period", ""),
            start_time=row["start_time"],
            end_time=row["end_time"],
            class_id=row["class_id"],
            class_name=row["class_name"],
            department=row.get("department", ""),
            semester=row.get("semester", 1),
            subject_id=row.get("subject_id") or row.get("subject_code", 0),
            subject_code=row["subject_code"],
            subject_name=row["subject_name"],
            faculty_id=row.get("faculty_id", 0),
            faculty_name=row["faculty_name"],
            room_id=row.get("room_id", 0),
            room_name=row["room_name"],
            room_type=row.get("room_type", "classroom"),
            occurrence=row.get("occurrence", 1),
        )
        db.add(entry)

    try:
        db.commit()
        db.refresh(pub_table)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Cannot publish schedule: referenced entity does not exist or violates database constraints: {str(exc)}",
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to publish timetable: {str(exc)}")

    return {
        "status": "success",
        "message": f"Timetable '{pub_table.title}' (Version {pub_table.version}) published successfully.",
        "id": pub_table.id,
        "title": pub_table.title,
        "version": pub_table.version,
        "scope": pub_table.scope,
        "class_id": pub_table.class_id,
        "semester": pub_table.semester,
        "department": pub_table.department,
        "sessions_published": len(request.schedule),
        "published_at": pub_table.created_at.isoformat(),
        "is_active": pub_table.is_active,
    }


@app.get("/api/timetable/published")
def list_published_timetables(
    scope: str | None = None,
    class_id: int | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(PublishedTimetable)
    if scope:
        query = query.filter(PublishedTimetable.scope == scope)
    if class_id:
        query = query.filter(PublishedTimetable.class_id == class_id)
    if is_active is not None:
        query = query.filter(PublishedTimetable.is_active.is_(is_active))

    timetables = query.order_by(PublishedTimetable.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "version": t.version,
            "scope": t.scope,
            "class_id": t.class_id,
            "department": t.department,
            "semester": t.semester,
            "working_hours": t.working_hours,
            "solver_status": t.solver_status,
            "solve_time_seconds": t.solve_time_seconds,
            "sections_scheduled": t.sections_scheduled,
            "weekly_sessions_scheduled": t.weekly_sessions_scheduled,
            "is_active": t.is_active,
            "published_by": t.published_by,
            "created_at": t.created_at.isoformat(),
        }
        for t in timetables
    ]


@app.get("/api/timetable/published/latest")
def get_latest_published_timetable(
    class_id: int | None = None,
    semester: int | None = None,
    department: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(PublishedTimetable).filter(PublishedTimetable.is_active.is_(True))
    if class_id is not None:
        query = query.filter(PublishedTimetable.class_id == class_id)
    if semester is not None:
        query = query.filter(PublishedTimetable.semester == semester)
    if department is not None:
        query = query.filter(PublishedTimetable.department == department)

    timetable = query.order_by(PublishedTimetable.version.desc(), PublishedTimetable.created_at.desc()).first()
    if not timetable:
        return {
            "status": "not_published",
            "message": "No active published timetable found for the requested criteria.",
            "schedule": [],
        }

    entries = [
        {
            "id": e.id,
            "day": e.day,
            "period": e.period,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "class_id": e.class_id,
            "class_name": e.class_name,
            "department": e.department,
            "semester": e.semester,
            "subject_id": e.subject_id,
            "subject_code": e.subject_code,
            "subject_name": e.subject_name,
            "faculty_id": e.faculty_id,
            "faculty_name": e.faculty_name,
            "room_id": e.room_id,
            "room_name": e.room_name,
            "room_type": e.room_type,
            "occurrence": e.occurrence,
        }
        for e in timetable.entries
    ]

    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}
    entries.sort(key=lambda row: (
        day_rank.get(row["day"], 99),
        _to_minutes(row["start_time"]),
    ))

    return {
        "status": "success",
        "id": timetable.id,
        "title": timetable.title,
        "version": timetable.version,
        "scope": timetable.scope,
        "class_id": timetable.class_id,
        "department": timetable.department,
        "semester": timetable.semester,
        "working_hours": timetable.working_hours,
        "solver_status": timetable.solver_status,
        "solve_time_seconds": timetable.solve_time_seconds,
        "weekly_sessions_scheduled": len(entries),
        "is_active": timetable.is_active,
        "published_at": timetable.created_at.isoformat(),
        "schedule": entries,
    }


@app.get("/api/timetable/published/{timetable_id}")
def get_published_timetable_by_id(
    timetable_id: int,
    db: Session = Depends(get_db),
):
    timetable = db.query(PublishedTimetable).filter(PublishedTimetable.id == timetable_id).first()
    if not timetable:
        raise HTTPException(status_code=404, detail="Published timetable not found")

    entries = [
        {
            "id": e.id,
            "day": e.day,
            "period": e.period,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "class_id": e.class_id,
            "class_name": e.class_name,
            "department": e.department,
            "semester": e.semester,
            "subject_id": e.subject_id,
            "subject_code": e.subject_code,
            "subject_name": e.subject_name,
            "faculty_id": e.faculty_id,
            "faculty_name": e.faculty_name,
            "room_id": e.room_id,
            "room_name": e.room_name,
            "room_type": e.room_type,
            "occurrence": e.occurrence,
        }
        for e in timetable.entries
    ]

    day_rank = {day: i for i, day in enumerate(VALID_DAYS)}
    entries.sort(key=lambda row: (
        day_rank.get(row["day"], 99),
        _to_minutes(row["start_time"]),
    ))

    return {
        "id": timetable.id,
        "title": timetable.title,
        "version": timetable.version,
        "scope": timetable.scope,
        "class_id": timetable.class_id,
        "department": timetable.department,
        "semester": timetable.semester,
        "working_hours": timetable.working_hours,
        "solver_status": timetable.solver_status,
        "solve_time_seconds": timetable.solve_time_seconds,
        "weekly_sessions_scheduled": len(entries),
        "is_active": timetable.is_active,
        "published_by": timetable.published_by,
        "created_at": timetable.created_at.isoformat(),
        "schedule": entries,
    }
