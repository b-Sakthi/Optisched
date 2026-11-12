import os

# Guarantee isolated SQLite database for test execution
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if "CLERK_SECRET_KEY" not in os.environ:
    os.environ["CLERK_SECRET_KEY"] = "sk_test_mock_test_key_for_testing"

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user
from app.db.session import Base, engine, SessionLocal
from app.models import (
    ClassSection,
    Subject,
    Faculty,
    Room,
    FacultySubject,
    CourseOffering,
    FacultyAvailability,
    PublishedTimetable,
    PublishedTimetableEntry,
)


class TestPhase2AdvancedScheduling(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        Base.metadata.create_all(bind=engine)
        self.client = TestClient(app)

        # Mock admin authorization
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "admin_test",
            "session_id": "sess_admin",
            "role": "admin",
            "payload": {"sub": "admin_test", "role": "admin"},
        }
        self.headers = {"Authorization": "Bearer admin_mock_token"}

    def tearDown(self):
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)

    # -------------------- 1. Room Capacity Sufficient --------------------
    def test_room_capacity_sufficient(self):
        """When section student_count <= room capacity, generation succeeds with that room."""
        # Section with 50 students
        sec = self.client.post("/api/sections", json={
            "name": "SEC-CAP-50", "department": "CS", "academic_year": 1, "semester": 1,
            "student_count": 50
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={
            "code": "CAP101", "name": "Basic Physics", "department": "CS"
        }, headers=self.headers).json()

        fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC-CAP1", "name": "Dr. Cap", "email": "cap1@opti.edu", "department": "CS"
        }, headers=self.headers).json()

        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)

        # Room with capacity 70 (sufficient for 50 students)
        rm = self.client.post("/api/rooms", json={
            "name": "CR-CAP-70", "room_type": "classroom", "capacity": 70
        }, headers=self.headers).json()

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 3, "requires_lab": False
        }, headers=self.headers)

        # 5-day grid
        slots = [{"name": f"P{p}", "start_time": f"{8+p:02d}:00", "end_time": f"{8+p:02d}:50"} for p in range(1, 5)]
        days = [{"day": d, "slots": slots} for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]]
        self.client.put("/api/timetable/configurations/1", json={"days": days}, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={"scope": "class", "class_id": sec["id"]}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(len(data["schedule"]), 3)
        for s in data["schedule"]:
            self.assertEqual(s["room_id"], rm["id"])

    # -------------------- 2. Room Capacity Insufficient --------------------
    def test_room_capacity_insufficient_filtered(self):
        """When multiple rooms exist, rooms with insufficient capacity are filtered out."""
        # Section with 60 students
        sec = self.client.post("/api/sections", json={
            "name": "SEC-CAP-60", "department": "CS", "academic_year": 1, "semester": 2,
            "student_count": 60
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={
            "code": "CAP201", "name": "Discrete Math", "department": "CS"
        }, headers=self.headers).json()

        fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC-CAP2", "name": "Dr. Math", "email": "math2@opti.edu", "department": "CS"
        }, headers=self.headers).json()

        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)

        # Small Room 40 (insufficient) and Large Room 80 (sufficient)
        rm_small = self.client.post("/api/rooms", json={"name": "CR-SMALL-40", "room_type": "classroom", "capacity": 40}, headers=self.headers).json()
        rm_large = self.client.post("/api/rooms", json={"name": "CR-LARGE-80", "room_type": "classroom", "capacity": 80}, headers=self.headers).json()

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 3, "requires_lab": False
        }, headers=self.headers)

        slots = [{"name": f"P{p}", "start_time": f"{8+p:02d}:00", "end_time": f"{8+p:02d}:50"} for p in range(1, 5)]
        days = [{"day": d, "slots": slots} for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]]
        self.client.put("/api/timetable/configurations/2", json={"days": days}, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={"scope": "class", "class_id": sec["id"]}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        # All assigned periods must be in CR-LARGE-80, never CR-SMALL-40
        for entry in data["schedule"]:
            self.assertEqual(entry["room_name"], "CR-LARGE-80")
            self.assertNotEqual(entry["room_name"], "CR-SMALL-40")

    # -------------------- 3. No Suitable Room Available --------------------
    def test_no_suitable_room_available_reports_error(self):
        """When no active room has sufficient capacity for a section, generator returns 400 error."""
        sec = self.client.post("/api/sections", json={
            "name": "SEC-TOO-BIG", "department": "CS", "academic_year": 1, "semester": 3,
            "student_count": 100
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={
            "code": "CAP301", "name": "Big Lecture", "department": "CS"
        }, headers=self.headers).json()

        fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC-CAP3", "name": "Dr. Big", "email": "big@opti.edu", "department": "CS"
        }, headers=self.headers).json()

        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)

        # Only rooms with capacity 40 and 50 exist
        self.client.post("/api/rooms", json={"name": "CR-40", "room_type": "classroom", "capacity": 40}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "CR-50", "room_type": "classroom", "capacity": 50}, headers=self.headers)

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 3, "requires_lab": False
        }, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={"scope": "class", "class_id": sec["id"]}, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("sufficient capacity", res.json()["detail"])
        self.assertIn("requires 100 seats", res.json()["detail"])

    # -------------------- 4. Faculty Unavailable During Selected Period --------------------
    def test_faculty_unavailable_period_blocked_in_cpsat(self):
        """When faculty is marked unavailable on Monday morning, solver never schedules them during that window."""
        sec = self.client.post("/api/sections", json={
            "name": "SEC-UNAVAIL-1", "department": "CS", "academic_year": 1, "semester": 4, "student_count": 40
        }, headers=self.headers).json()

        sub = self.client.post("/api/subjects", json={"code": "UNAV101", "name": "Networks", "department": "CS"}, headers=self.headers).json()
        fac = self.client.post("/api/faculty", json={"employee_id": "FAC-UNAV1", "name": "Dr. Busy", "email": "busy@opti.edu", "department": "CS"}, headers=self.headers).json()
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "CR-UNAV", "room_type": "classroom", "capacity": 60}, headers=self.headers)

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 4, "requires_lab": False
        }, headers=self.headers)

        # Block Monday from 09:00 to 12:00 for Dr. Busy
        r_blk = self.client.post("/api/faculty-availability", json={
            "faculty_id": fac["id"],
            "day": "Monday",
            "start_time": "09:00",
            "end_time": "12:00",
            "is_available": False,
            "reason": "Department Research Committee Meeting",
        }, headers=self.headers)
        self.assertEqual(r_blk.status_code, 201)

        # 5-day grid with Monday 09:00, 10:00, 11:00, 14:00
        slots = [
            {"name": "Period 1", "start_time": "09:00", "end_time": "09:50"},
            {"name": "Period 2", "start_time": "10:00", "end_time": "10:50"},
            {"name": "Period 3", "start_time": "11:00", "end_time": "11:50"},
            {"name": "Period 4", "start_time": "14:00", "end_time": "14:50"},
        ]
        days = [{"day": d, "slots": slots} for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]]
        self.client.put("/api/timetable/configurations/4", json={"days": days}, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={"scope": "class", "class_id": sec["id"]}, headers=self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        for s in data["schedule"]:
            # Confirm no session is scheduled on Monday between 09:00 and 12:00
            if s["day"] == "Monday":
                self.assertNotIn(s["start_time"], ["09:00", "10:00", "11:00"])

    # -------------------- 5. Faculty Available During Selected Period --------------------
    def test_faculty_available_period_scheduled(self):
        """When availability constraint is deleted or faculty is available, solver schedules normally."""
        sec = self.client.post("/api/sections", json={
            "name": "SEC-AVAIL-1", "department": "CS", "academic_year": 1, "semester": 5, "student_count": 30
        }, headers=self.headers).json()
        sub = self.client.post("/api/subjects", json={"code": "AV101", "name": "AI Basics", "department": "CS"}, headers=self.headers).json()
        fac = self.client.post("/api/faculty", json={"employee_id": "FAC-FREE1", "name": "Dr. Free", "email": "free@opti.edu", "department": "CS"}, headers=self.headers).json()
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "CR-AV", "room_type": "classroom", "capacity": 50}, headers=self.headers)

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 2, "requires_lab": False
        }, headers=self.headers)

        # Create block then delete it
        r_blk = self.client.post("/api/faculty-availability", json={
            "faculty_id": fac["id"], "day": "Tuesday", "start_time": "09:00", "end_time": "12:00",
            "is_available": False, "reason": "Temporary",
        }, headers=self.headers).json()
        blk_id = r_blk["id"]

        r_del = self.client.delete(f"/api/faculty-availability/{blk_id}", headers=self.headers)
        self.assertEqual(r_del.status_code, 200)

        slots = [{"name": "P1", "start_time": "09:00", "end_time": "09:50"}]
        days = [{"day": d, "slots": slots} for d in ["Monday", "Tuesday"]]
        self.client.put("/api/timetable/configurations/5", json={"days": days}, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={"scope": "class", "class_id": sec["id"]}, headers=self.headers)
        self.assertEqual(res.status_code, 200)

    # -------------------- 6. Room-Wise Timetable Retrieval --------------------
    def test_room_wise_timetable_retrieval(self):
        """Room-wise schedule API returns occupied sessions for that specific room."""
        rm = self.client.post("/api/rooms", json={"name": "AUDITORIUM-1", "room_type": "classroom", "capacity": 200}, headers=self.headers).json()

        # Publish a sample schedule using AUDITORIUM-1
        pub_payload = {
            "title": "Semester 1 Master",
            "scope": "class",
            "class_id": 1,
            "working_hours": "09:00-16:00",
            "solver_status": "optimal",
            "schedule": [
                {
                    "day": "Monday", "period": "Period 1", "start_time": "09:00", "end_time": "09:50",
                    "class_id": 1, "class_name": "CSE-1A", "department": "CS", "semester": 1,
                    "subject_id": 1, "subject_code": "CS101", "subject_name": "Computing",
                    "faculty_id": 1, "faculty_name": "Dr. Alice",
                    "room_id": rm["id"], "room_name": "AUDITORIUM-1", "room_type": "classroom",
                    "occurrence": 1,
                }
            ]
        }
        r_pub = self.client.post("/api/timetable/publish", json=pub_payload, headers=self.headers)
        self.assertEqual(r_pub.status_code, 201)

        # Retrieve room schedule
        r_room_sched = self.client.get(f"/api/rooms/{rm['id']}/schedule")
        self.assertEqual(r_room_sched.status_code, 200)
        data = r_room_sched.json()
        self.assertEqual(data["room_name"], "AUDITORIUM-1")
        self.assertEqual(data["scheduled_sessions_count"], 1)
        self.assertEqual(data["schedule"][0]["subject_code"], "CS101")

    # -------------------- 7. Successful Timetable Publishing --------------------
    def test_successful_timetable_publishing(self):
        """Valid generated timetable can be persisted and published to database."""
        pub_payload = {
            "title": "Fall 2026 CS-3A Timetable",
            "scope": "class",
            "class_id": 10,
            "working_hours": "09:00-16:00",
            "solver_status": "optimal",
            "solve_time_seconds": 0.045,
            "schedule": [
                {
                    "day": "Monday", "period": "Period 1", "start_time": "09:00", "end_time": "09:50",
                    "class_id": 10, "class_name": "CS-3A", "department": "CS", "semester": 3,
                    "subject_id": 101, "subject_code": "CS301", "subject_name": "Operating Systems",
                    "faculty_id": 201, "faculty_name": "Dr. Bob",
                    "room_id": 301, "room_name": "CR-101", "room_type": "classroom",
                    "occurrence": 1,
                }
            ],
            "notes": ["Verified 0 clashes"]
        }
        res = self.client.post("/api/timetable/publish", json=pub_payload, headers=self.headers)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["title"], "Fall 2026 CS-3A Timetable")
        self.assertEqual(data["version"], 1)
        self.assertEqual(data["sessions_published"], 1)
        self.assertTrue(data["is_active"])

    # -------------------- 8. Rejection of Invalid Timetable Publishing --------------------
    def test_rejection_of_invalid_timetable_publishing(self):
        """Publish API rejects schedules with conflicting sessions or clashes."""
        conflicting_payload = {
            "title": "Corrupt Schedule",
            "scope": "class",
            "class_id": 1,
            "schedule": [
                # Two classes booked in the same room at the same time
                {
                    "day": "Monday", "period": "P1", "start_time": "09:00", "end_time": "09:50",
                    "class_id": 1, "class_name": "Sec-A", "subject_id": 1, "subject_code": "CS1", "subject_name": "S1",
                    "faculty_id": 1, "faculty_name": "F1", "room_id": 10, "room_name": "Room 10", "room_type": "classroom",
                    "occurrence": 1,
                },
                {
                    "day": "Monday", "period": "P1", "start_time": "09:00", "end_time": "09:50",
                    "class_id": 2, "class_name": "Sec-B", "subject_id": 2, "subject_code": "CS2", "subject_name": "S2",
                    "faculty_id": 2, "faculty_name": "F2", "room_id": 10, "room_name": "Room 10", "room_type": "classroom",
                    "occurrence": 1,
                },
            ]
        }
        res = self.client.post("/api/timetable/publish", json=conflicting_payload, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot publish schedule with unresolved conflicts", res.json()["detail"])
        self.assertIn("room clash", res.json()["detail"])

    # -------------------- 9. Retrieving Previously Published Timetable Versions --------------------
    def test_retrieving_published_versions_and_history(self):
        """Preserves version history (version 1, 2) and allows retrieval of both."""
        class_target_id = 99
        # Publish Version 1
        v1_payload = {
            "title": "V1 CS-4A", "scope": "class", "class_id": class_target_id,
            "schedule": [
                {"day": "Monday", "period": "P1", "start_time": "09:00", "end_time": "09:50", "class_id": class_target_id, "class_name": "4A", "subject_id": 1, "subject_code": "C1", "subject_name": "N1", "faculty_id": 1, "faculty_name": "F1", "room_id": 1, "room_name": "R1", "room_type": "classroom", "occurrence": 1}
            ]
        }
        r_v1 = self.client.post("/api/timetable/publish", json=v1_payload, headers=self.headers).json()
        self.assertEqual(r_v1["version"], 1)

        # Publish Version 2
        v2_payload = {
            "title": "V2 CS-4A Updated", "scope": "class", "class_id": class_target_id,
            "schedule": [
                {"day": "Tuesday", "period": "P1", "start_time": "10:00", "end_time": "10:50", "class_id": class_target_id, "class_name": "4A", "subject_id": 1, "subject_code": "C1", "subject_name": "N1", "faculty_id": 1, "faculty_name": "F1", "room_id": 1, "room_name": "R1", "room_type": "classroom", "occurrence": 1}
            ]
        }
        r_v2 = self.client.post("/api/timetable/publish", json=v2_payload, headers=self.headers).json()
        self.assertEqual(r_v2["version"], 2)

        # List all published versions for this class
        r_list = self.client.get(f"/api/timetable/published?class_id={class_target_id}")
        self.assertEqual(r_list.status_code, 200)
        items = r_list.json()
        self.assertEqual(len(items), 2)
        versions = [i["version"] for i in items]
        self.assertIn(1, versions)
        self.assertIn(2, versions)

        # Retrieve specific historical Version 1
        r_hist = self.client.get(f"/api/timetable/published/{r_v1['id']}")
        self.assertEqual(r_hist.status_code, 200)
        self.assertEqual(r_hist.json()["title"], "V1 CS-4A")
        self.assertFalse(r_hist.json()["is_active"])

    # -------------------- 10. Faculty and Student Access to Published Schedules --------------------
    def test_faculty_and_student_access_to_published_schedules(self):
        """Latest published schedule is accessible via public /api/timetable/published/latest endpoint."""
        target_class_id = 77
        pub_payload = {
            "title": "Official Spring Schedule",
            "scope": "class",
            "class_id": target_class_id,
            "schedule": [
                {
                    "day": "Wednesday", "period": "Period 2", "start_time": "10:00", "end_time": "10:50",
                    "class_id": target_class_id, "class_name": "CS-Spring", "department": "CS", "semester": 2,
                    "subject_id": 55, "subject_code": "CS205", "subject_name": "Web Systems",
                    "faculty_id": 88, "faculty_name": "Prof. Web",
                    "room_id": 99, "room_name": "CR-WEB", "room_type": "classroom",
                    "occurrence": 1,
                }
            ]
        }
        self.client.post("/api/timetable/publish", json=pub_payload, headers=self.headers)

        # Access without admin auth header (public / student / faculty view access)
        res = self.client.get(f"/api/timetable/published/latest?class_id={target_class_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["title"], "Official Spring Schedule")
        self.assertEqual(len(data["schedule"]), 1)
        self.assertEqual(data["schedule"][0]["subject_code"], "CS205")
        self.assertEqual(data["schedule"][0]["faculty_name"], "Prof. Web")


if __name__ == "__main__":
    unittest.main()
