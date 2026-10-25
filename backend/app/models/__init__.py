from app.models.faculty import Faculty
from app.models.classes import ClassSection
from app.models.subjects import Subject
from app.models.rooms import Room
from app.models.faculty_subjects import FacultySubject
from app.models.course_offerings import CourseOffering
from app.models.timetable_config import TimetableConfig

__all__ = [
    "Faculty",
    "ClassSection",
    "Subject",
    "Room",
    "FacultySubject",
    "CourseOffering",
    "TimetableConfig",
]
