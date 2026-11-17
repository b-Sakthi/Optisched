import os
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if "CLERK_SECRET_KEY" not in os.environ:
    os.environ["CLERK_SECRET_KEY"] = "sk_test_mock_test_key_for_testing"

import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import Base, engine, SessionLocal
from app.models import (
    User,
    Faculty,
    ClassSection,
    Subject,
    Room,
    CourseOffering,
    TimetableConfig,
    PublishedTimetable,
    PublishedTimetableEntry,
    FacultyAvailability,
)
from app.core.security import hash_password


class TestDatabaseIntegrityRemediation(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.client = TestClient(app)

        # Mock admin auth
        from app.core.auth import get_current_user
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "admin_test",
            "session_id": "sess_admin",
            "role": "admin",
            "payload": {"sub": "admin_test", "role": "admin"},
        }
        self.headers = {"Authorization": "Bearer test_admin_token"}

    def tearDown(self):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)

    # 1. Test two departments creating Section A
    def test_two_departments_can_create_same_section_name(self):
        # Department 1: Computer Science creates "Section A"
        res1 = self.client.post("/api/sections", json={
            "name": "Section A",
            "department": "Computer Science",
            "academic_year": 1,
            "semester": 1,
            "student_count": 60,
        }, headers=self.headers)
        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res1.json()["name"], "Section A")

        # Department 2: Mechanical Engineering creates "Section A" (SHOULD SUCCEED)
        res2 = self.client.post("/api/sections", json={
            "name": "Section A",
            "department": "Mechanical Engineering",
            "academic_year": 1,
            "semester": 1,
            "student_count": 55,
        }, headers=self.headers)
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.json()["name"], "Section A")

        # But duplicate "Section A" in SAME department, year, and semester must be REJECTED (409)
        res_dup = self.client.post("/api/sections", json={
            "name": "Section A",
            "department": "Computer Science",
            "academic_year": 1,
            "semester": 1,
            "student_count": 60,
        }, headers=self.headers)
        self.assertEqual(res_dup.status_code, 409)

    # 2. Test two buildings creating Room 101
    def test_two_buildings_can_create_same_room_number(self):
        # Building 1: Science Wing creates "Room 101"
        res1 = self.client.post("/api/rooms", json={
            "name": "Room 101",
            "building": "Science Wing",
            "room_type": "classroom",
            "capacity": 60,
        }, headers=self.headers)
        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res1.json()["name"], "Room 101")

        # Building 2: Engineering Block creates "Room 101" (SHOULD SUCCEED)
        res2 = self.client.post("/api/rooms", json={
            "name": "Room 101",
            "building": "Engineering Block",
            "room_type": "classroom",
            "capacity": 50,
        }, headers=self.headers)
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.json()["name"], "Room 101")

        # Duplicate Room 101 in the SAME building must be REJECTED (409)
        res_dup = self.client.post("/api/rooms", json={
            "name": "Room 101",
            "building": "Science Wing",
            "room_type": "classroom",
            "capacity": 45,
        }, headers=self.headers)
        self.assertEqual(res_dup.status_code, 409)

    # 3. Test separate academic periods having independent timetable configurations
    def test_separate_academic_periods_have_independent_configurations(self):
        days_payload = [
            {
                "day": "Monday",
                "is_half_day": False,
                "slots": [
                    {"name": "Period 1", "start_time": "09:00", "end_time": "09:50"},
                    {"name": "Period 2", "start_time": "09:55", "end_time": "10:45"},
                ],
            }
        ]

        # Config for Semester 1 (Engineering)
        res1 = self.client.put("/api/timetable/configurations/1", json={
            "department": "Engineering",
            "days": days_payload,
            "period_duration": 50,
            "transition_duration": 5,
        }, headers=self.headers)
        self.assertEqual(res1.status_code, 200)

        # Config for Semester 1 (Medical Sciences) - independent config for same semester number
        res2 = self.client.put("/api/timetable/configurations/1", json={
            "department": "Medical Sciences",
            "days": days_payload,
            "period_duration": 50,
            "transition_duration": 5,
        }, headers=self.headers)
        self.assertEqual(res2.status_code, 200)

        # Verify both configurations exist independently
        list_res = self.client.get("/api/timetable/configurations")
        self.assertEqual(list_res.status_code, 200)
        configs = list_res.json()
        depts = {c.get("department") for c in configs if c.get("semester") == 1}
        self.assertIn("Engineering", depts)
        self.assertIn("Medical Sciences", depts)

    # 4. Test invalid room capacity being rejected
    def test_invalid_room_capacity_rejected(self):
        res_zero = self.client.post("/api/rooms", json={
            "name": "Invalid Room Zero",
            "building": "Test Block",
            "room_type": "classroom",
            "capacity": 0,
        }, headers=self.headers)
        self.assertEqual(res_zero.status_code, 422)

        res_neg = self.client.post("/api/rooms", json={
            "name": "Invalid Room Negative",
            "building": "Test Block",
            "room_type": "classroom",
            "capacity": -10,
        }, headers=self.headers)
        self.assertEqual(res_neg.status_code, 422)

    # 5. Test invalid weekly periods being rejected
    def test_invalid_weekly_periods_rejected(self):
        # Create prerequisites: Section, Subject, Faculty
        sec_res = self.client.post("/api/sections", json={
            "name": "CSE-101",
            "department": "CSE",
            "academic_year": 1,
            "semester": 1,
        }, headers=self.headers)
        class_id = sec_res.json()["id"]

        sub_res = self.client.post("/api/subjects", json={
            "code": "CS101",
            "name": "Computer Science",
            "department": "CSE",
        }, headers=self.headers)
        sub_id = sub_res.json()["id"]

        fac_res = self.client.post("/api/faculty", json={
            "employee_id": "FAC001",
            "name": "Dr. Smith",
            "email": "smith@optisched.com",
            "department": "CSE",
        }, headers=self.headers)
        fac_id = fac_res.json()["id"]

        # Attempt to create offering with 0 weekly periods (MUST FAIL with 400 or 422)
        res_zero = self.client.post("/api/course-offerings", json={
            "class_id": class_id,
            "subject_id": sub_id,
            "faculty_id": fac_id,
            "weekly_periods": 0,
        }, headers=self.headers)
        self.assertIn(res_zero.status_code, [400, 422])

        # Attempt to create offering with negative weekly periods (MUST FAIL)
        res_neg = self.client.post("/api/course-offerings", json={
            "class_id": class_id,
            "subject_id": sub_id,
            "faculty_id": fac_id,
            "weekly_periods": -3,
        }, headers=self.headers)
        self.assertIn(res_neg.status_code, [400, 422])

    # 6. Test invalid faculty availability intervals being rejected
    def test_invalid_faculty_availability_intervals_rejected(self):
        fac_res = self.client.post("/api/faculty", json={
            "employee_id": "FAC002",
            "name": "Dr. Jones",
            "email": "jones@optisched.com",
            "department": "CSE",
        }, headers=self.headers)
        fac_id = fac_res.json()["id"]

        # Inverted interval (start_time > end_time)
        res_inv = self.client.post("/api/faculty-availability", json={
            "faculty_id": fac_id,
            "day": "Monday",
            "start_time": "14:00",
            "end_time": "10:00",
            "is_available": False,
        }, headers=self.headers)
        self.assertEqual(res_inv.status_code, 400)

        # Equal interval (start_time == end_time)
        res_eq = self.client.post("/api/faculty-availability", json={
            "faculty_id": fac_id,
            "day": "Monday",
            "start_time": "10:00",
            "end_time": "10:00",
            "is_available": False,
        }, headers=self.headers)
        self.assertEqual(res_eq.status_code, 400)

        # Invalid day name
        res_day = self.client.post("/api/faculty-availability", json={
            "faculty_id": fac_id,
            "day": "Funday",
            "start_time": "09:00",
            "end_time": "11:00",
            "is_available": False,
        }, headers=self.headers)
        self.assertEqual(res_day.status_code, 400)

    # 7. Test published entries referencing nonexistent faculty, rooms, sections, or subjects being rejected
    def test_published_entries_referencing_nonexistent_entities_rejected(self):
        # Create valid Section, Room, Faculty, Subject
        sec = self.client.post("/api/sections", json={
            "name": "CSE-2A", "department": "CSE", "academic_year": 1, "semester": 2
        }, headers=self.headers).json()

        fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC003", "name": "Prof. Miller", "email": "miller@optisched.com", "department": "CSE"
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={
            "code": "CS201", "name": "Data Structures", "department": "CSE"
        }, headers=self.headers).json()

        rm = self.client.post("/api/rooms", json={
            "name": "Room 201", "building": "Main", "room_type": "classroom", "capacity": 60
        }, headers=self.headers).json()

        # Add course offering and qualification so validator passes
        self.client.post(f"/api/faculty/{fac['id']}/qualifications", json={"subject_id": sub["id"]}, headers=self.headers)
        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"], "weekly_periods": 1
        }, headers=self.headers)

        # Schedule entry with NONEXISTENT faculty_id (99999)
        invalid_schedule_fac = [{
            "day": "Monday",
            "period": "Period 1",
            "start_time": "09:00",
            "end_time": "09:50",
            "class_id": sec["id"],
            "class_name": sec["name"],
            "department": "CSE",
            "semester": 2,
            "subject_id": sub["id"],
            "subject_code": sub["code"],
            "subject_name": sub["name"],
            "faculty_id": 99999,  # Nonexistent
            "faculty_name": "Ghost Faculty",
            "room_id": rm["id"],
            "room_name": rm["name"],
            "room_type": "classroom",
            "occurrence": 1,
        }]

        res_pub_bad_fac = self.client.post("/api/timetable/publish", json={
            "title": "Invalid Published Schedule",
            "scope": "class",
            "class_id": sec["id"],
            "solver_status": "optimal",
            "schedule": invalid_schedule_fac,
        }, headers=self.headers)
        self.assertEqual(res_pub_bad_fac.status_code, 400)

        # Schedule entry with NONEXISTENT room_id (88888)
        invalid_schedule_rm = [{
            "day": "Monday",
            "period": "Period 1",
            "start_time": "09:00",
            "end_time": "09:50",
            "class_id": sec["id"],
            "class_name": sec["name"],
            "department": "CSE",
            "semester": 2,
            "subject_id": sub["id"],
            "subject_code": sub["code"],
            "subject_name": sub["name"],
            "faculty_id": fac["id"],
            "faculty_name": fac["name"],
            "room_id": 88888,  # Nonexistent
            "room_name": "Ghost Room",
            "room_type": "classroom",
            "occurrence": 1,
        }]

        res_pub_bad_rm = self.client.post("/api/timetable/publish", json={
            "title": "Invalid Published Schedule",
            "scope": "class",
            "class_id": sec["id"],
            "solver_status": "optimal",
            "schedule": invalid_schedule_rm,
        }, headers=self.headers)
        self.assertEqual(res_pub_bad_rm.status_code, 400)

    # 8. Test existing valid records remain accessible
    def test_existing_valid_records_remain_accessible(self):
        # Create standard academic records
        sec = self.client.post("/api/sections", json={
            "name": "CSE-3A", "department": "CSE", "academic_year": 2, "semester": 3, "student_count": 50
        }, headers=self.headers).json()

        rm = self.client.post("/api/rooms", json={
            "name": "Lab 301", "building": "Science Wing", "room_type": "lab", "capacity": 50
        }, headers=self.headers).json()

        fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC004", "name": "Prof. Davis", "email": "davis@optisched.com", "department": "CSE"
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={
            "code": "CS301", "name": "Algorithms", "department": "CSE"
        }, headers=self.headers).json()

        # Qualification and Course Offering
        self.client.post(f"/api/faculty/{fac['id']}/qualifications", json={"subject_id": sub["id"]}, headers=self.headers)
        off = self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"], "weekly_periods": 3, "requires_lab": True
        }, headers=self.headers).json()

        # Verify retrieval
        self.assertEqual(self.client.get(f"/api/sections/{sec['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/rooms/{rm['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/faculty/{fac['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/subjects/{sub['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/course-offerings/{off['id']}").status_code, 200)

        # Publish a valid schedule
        valid_schedule = [{
            "day": "Tuesday",
            "period": "Period 1",
            "start_time": "10:00",
            "end_time": "10:50",
            "class_id": sec["id"],
            "class_name": sec["name"],
            "department": "CSE",
            "semester": 3,
            "subject_id": sub["id"],
            "subject_code": sub["code"],
            "subject_name": sub["name"],
            "faculty_id": fac["id"],
            "faculty_name": fac["name"],
            "room_id": rm["id"],
            "room_name": rm["name"],
            "room_type": "lab",
            "occurrence": 1,
        }]

        pub_res = self.client.post("/api/timetable/publish", json={
            "title": "Official Algorithms Schedule",
            "scope": "class",
            "class_id": sec["id"],
            "solver_status": "optimal",
            "schedule": valid_schedule,
        }, headers=self.headers)
        self.assertEqual(pub_res.status_code, 201)
        pub_id = pub_res.json()["id"]

        # Verify published timetable and entry retrieval
        get_pub = self.client.get(f"/api/timetable/published/{pub_id}")
        self.assertEqual(get_pub.status_code, 200)
        self.assertEqual(len(get_pub.json()["schedule"]), 1)
        self.assertEqual(get_pub.json()["schedule"][0]["faculty_name"], "Prof. Davis")


if __name__ == "__main__":
    unittest.main()
