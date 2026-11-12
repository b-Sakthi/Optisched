import os
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if "CLERK_SECRET_KEY" not in os.environ:
    os.environ["CLERK_SECRET_KEY"] = "sk_test_mock_test_key_for_testing"

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user
from app.db.session import Base, engine, SessionLocal
from app.models import ClassSection, Subject, Faculty, Room, FacultySubject, CourseOffering, TimetableConfig


class TestAcademicDataCRUDAndGeneration(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        Base.metadata.create_all(bind=engine)
        self.client = TestClient(app)
        # Mock admin auth
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

    # -------------------- 1. Sections CRUD --------------------
    def test_section_crud_and_validation(self):
        # Create
        res = self.client.post("/api/sections", json={
            "name": "CSE-1A",
            "department": "Computer Science",
            "academic_year": 1,
            "semester": 1,
        }, headers=self.headers)
        self.assertEqual(res.status_code, 201)
        sec_id = res.json()["id"]

        # Duplicate name prevention
        res_dup = self.client.post("/api/sections", json={
            "name": "CSE-1A",
            "department": "Computer Science",
            "academic_year": 1,
            "semester": 1,
        }, headers=self.headers)
        self.assertEqual(res_dup.status_code, 409)

        # Invalid semester
        res_inv = self.client.post("/api/sections", json={
            "name": "CSE-1B",
            "department": "Computer Science",
            "academic_year": 1,
            "semester": 9,
        }, headers=self.headers)
        self.assertEqual(res_inv.status_code, 422)

        # Read
        res_get = self.client.get(f"/api/sections/{sec_id}")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["name"], "CSE-1A")

        # Update
        res_put = self.client.put(f"/api/sections/{sec_id}", json={
            "name": "CSE-1A-Updated",
            "semester": 2,
        }, headers=self.headers)
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(res_put.json()["name"], "CSE-1A-Updated")
        self.assertEqual(res_put.json()["semester"], 2)

        # Delete
        res_del = self.client.delete(f"/api/sections/{sec_id}", headers=self.headers)
        self.assertEqual(res_del.status_code, 200)

        # Verify 404
        self.assertEqual(self.client.get(f"/api/sections/{sec_id}").status_code, 404)

    # -------------------- 2. Subjects CRUD --------------------
    def test_subject_crud_and_validation(self):
        # Create
        res = self.client.post("/api/subjects", json={
            "code": "CS101",
            "name": "Programming Fundamentals",
            "department": "Computer Science",
        }, headers=self.headers)
        self.assertEqual(res.status_code, 201)
        sub_id = res.json()["id"]

        # Duplicate code prevention
        res_dup = self.client.post("/api/subjects", json={
            "code": "CS101",
            "name": "Other Subject",
            "department": "Computer Science",
        }, headers=self.headers)
        self.assertEqual(res_dup.status_code, 409)

        # Read & Update
        res_put = self.client.put(f"/api/subjects/{sub_id}", json={
            "name": "Advanced Programming",
        }, headers=self.headers)
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(res_put.json()["name"], "Advanced Programming")

        # Delete
        res_del = self.client.delete(f"/api/subjects/{sub_id}", headers=self.headers)
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(self.client.get(f"/api/subjects/{sub_id}").status_code, 404)

    # -------------------- 3. Rooms CRUD --------------------
    def test_room_crud_and_validation(self):
        # Invalid capacity <= 0
        res_inv = self.client.post("/api/rooms", json={
            "name": "R001",
            "room_type": "classroom",
            "capacity": 0,
        }, headers=self.headers)
        self.assertEqual(res_inv.status_code, 422)

        # Create classroom & lab
        res_cr = self.client.post("/api/rooms", json={
            "name": "CR-101",
            "room_type": "classroom",
            "capacity": 60,
            "building": "Block A",
        }, headers=self.headers)
        self.assertEqual(res_cr.status_code, 201)
        cr_id = res_cr.json()["id"]

        res_lab = self.client.post("/api/rooms", json={
            "name": "LAB-201",
            "room_type": "lab",
            "capacity": 30,
        }, headers=self.headers)
        self.assertEqual(res_lab.status_code, 201)

        # Update room
        res_put = self.client.put(f"/api/rooms/{cr_id}", json={
            "capacity": 65,
        }, headers=self.headers)
        self.assertEqual(res_put.status_code, 200)
        self.assertEqual(res_put.json()["capacity"], 65)

        # Delete room
        res_del = self.client.delete(f"/api/rooms/{cr_id}", headers=self.headers)
        self.assertEqual(res_del.status_code, 200)

    # -------------------- 4. Faculty and Qualifications --------------------
    def test_faculty_and_qualifications(self):
        # Create faculty
        res_fac = self.client.post("/api/faculty", json={
            "employee_id": "FAC001",
            "name": "Dr. Turing",
            "email": "turing@optisched.edu",
            "department": "Computer Science",
        }, headers=self.headers)
        self.assertEqual(res_fac.status_code, 201)
        fac_id = res_fac.json()["id"]

        # Duplicate email
        res_dup = self.client.post("/api/faculty", json={
            "employee_id": "FAC002",
            "name": "Dr. Lovelace",
            "email": "turing@optisched.edu",
            "department": "Computer Science",
        }, headers=self.headers)
        self.assertEqual(res_dup.status_code, 409)

        # Create subject
        res_sub = self.client.post("/api/subjects", json={
            "code": "CS101",
            "name": "Algorithms",
            "department": "Computer Science",
        }, headers=self.headers)
        sub_id = res_sub.json()["id"]

        # Assign qualification
        res_qual = self.client.post("/api/faculty-subjects", json={
            "faculty_id": fac_id,
            "subject_id": sub_id,
        }, headers=self.headers)
        self.assertEqual(res_qual.status_code, 201)
        mapping_id = res_qual.json()["id"]

        # List qualifications
        res_list = self.client.get("/api/faculty-subjects")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.json()), 1)
        self.assertEqual(res_list.json()[0]["subject_code"], "CS101")

        # Delete qualification
        res_del_qual = self.client.delete(f"/api/faculty-subjects/{mapping_id}", headers=self.headers)
        self.assertEqual(res_del_qual.status_code, 200)

    # -------------------- 5. Course Offerings & Cascade Protection --------------------
    def test_course_offerings_and_cascade_protection(self):
        # Setup section, subject, faculty, qualification
        sec = self.client.post("/api/sections", json={"name": "S1", "department": "CS", "academic_year": 1, "semester": 1}, headers=self.headers).json()
        sub = self.client.post("/api/subjects", json={"code": "CS101", "name": "Intro", "department": "CS"}, headers=self.headers).json()
        fac = self.client.post("/api/faculty", json={"employee_id": "F1", "name": "Prof A", "email": "a@opti.edu", "department": "CS"}, headers=self.headers).json()
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)

        # Add course offering
        res_off = self.client.post("/api/course-offerings", json={
            "class_id": sec["id"],
            "subject_id": sub["id"],
            "faculty_id": fac["id"],
            "weekly_periods": 4,
            "requires_lab": False,
        }, headers=self.headers)
        self.assertEqual(res_off.status_code, 201)
        off_id = res_off.json()["id"]

        # Try to delete section while offering exists -> Expect 409 Conflict
        res_del_sec = self.client.delete(f"/api/sections/{sec['id']}", headers=self.headers)
        self.assertEqual(res_del_sec.status_code, 409)
        self.assertIn("referenced by", res_del_sec.json()["detail"])

        # Try to delete subject while offering exists -> Expect 409 Conflict
        res_del_sub = self.client.delete(f"/api/subjects/{sub['id']}", headers=self.headers)
        self.assertEqual(res_del_sub.status_code, 409)
        self.assertIn("referenced by", res_del_sub.json()["detail"])

        # Try to delete faculty while offering exists -> Expect 409 Conflict
        res_del_fac = self.client.delete(f"/api/faculty/{fac['id']}", headers=self.headers)
        self.assertEqual(res_del_fac.status_code, 409)
        self.assertIn("currently assigned", res_del_fac.json()["detail"])

        # Delete offering, then section deletion succeeds
        res_del_off = self.client.delete(f"/api/course-offerings/{off_id}", headers=self.headers)
        self.assertEqual(res_del_off.status_code, 200)

        res_del_sec2 = self.client.delete(f"/api/sections/{sec['id']}", headers=self.headers)
        self.assertEqual(res_del_sec2.status_code, 200)

    # -------------------- 6. CSV Bulk Import --------------------
    def test_csv_import_preview_and_commit(self):
        csv_data = (
            "class_id,programme,semester,section,student_count\n"
            "CSE101,CSE,1,A,60\n"
            "CSE102,CSE,1,B,58\n"
        )
        # Preview
        res_prev = self.client.post("/api/import/csv", json={
            "entity": "sections",
            "csv_content": csv_data,
            "preview_only": True,
        }, headers=self.headers)
        self.assertEqual(res_prev.status_code, 200)
        self.assertEqual(res_prev.json()["valid_count"], 2)
        self.assertTrue(res_prev.json()["can_import"])

        # Commit
        res_commit = self.client.post("/api/import/csv", json={
            "entity": "sections",
            "csv_content": csv_data,
            "preview_only": False,
        }, headers=self.headers)
        self.assertEqual(res_commit.status_code, 200)
        self.assertEqual(res_commit.json()["imported_count"], 2)

        # Verify DB has 2 sections
        sec_list = self.client.get("/api/sections").json()
        self.assertEqual(len(sec_list), 2)

    # -------------------- 7. Full 10-Step Acceptance Criteria Timetable Run --------------------
    def test_acceptance_criteria_workflow(self):
        """
        1. Admin signs in.
        2. Admin adds two classes.
        3. Admin adds four subjects.
        4. Admin adds three faculty members.
        5. Admin maps faculty to qualified subjects.
        6. Admin adds two classrooms and one laboratory.
        7. Admin creates course requirements.
        8. Admin configures five working days and seven periods.
        9. Admin generates a timetable using the actual entered records.
        10. Admin sees the generated timetable and validation results.
        """
        # Step 2: Add 2 classes
        s1 = self.client.post("/api/sections", json={"name": "CS-Sec-A", "department": "Computer Science", "academic_year": 1, "semester": 1}, headers=self.headers).json()
        s2 = self.client.post("/api/sections", json={"name": "CS-Sec-B", "department": "Computer Science", "academic_year": 1, "semester": 1}, headers=self.headers).json()

        # Step 3: Add 4 subjects
        sub1 = self.client.post("/api/subjects", json={"code": "CS101", "name": "Programming Fundamentals", "department": "Computer Science"}, headers=self.headers).json()
        sub2 = self.client.post("/api/subjects", json={"code": "CS102", "name": "Discrete Mathematics", "department": "Computer Science"}, headers=self.headers).json()
        sub3 = self.client.post("/api/subjects", json={"code": "CS103", "name": "Digital Logic", "department": "Computer Science"}, headers=self.headers).json()
        sub4 = self.client.post("/api/subjects", json={"code": "CS104L", "name": "Computing Laboratory", "department": "Computer Science"}, headers=self.headers).json()

        # Step 4: Add 3 faculty members
        f1 = self.client.post("/api/faculty", json={"employee_id": "FAC-01", "name": "Dr. Alice Smith", "email": "alice@optisched.edu", "department": "Computer Science"}, headers=self.headers).json()
        f2 = self.client.post("/api/faculty", json={"employee_id": "FAC-02", "name": "Prof. Bob Jones", "email": "bob@optisched.edu", "department": "Computer Science"}, headers=self.headers).json()
        f3 = self.client.post("/api/faculty", json={"employee_id": "FAC-03", "name": "Dr. Carol White", "email": "carol@optisched.edu", "department": "Computer Science"}, headers=self.headers).json()

        # Step 5: Map faculty to qualified subjects
        self.client.post("/api/faculty-subjects", json={"faculty_id": f1["id"], "subject_id": sub1["id"]}, headers=self.headers)
        self.client.post("/api/faculty-subjects", json={"faculty_id": f1["id"], "subject_id": sub2["id"]}, headers=self.headers)
        self.client.post("/api/faculty-subjects", json={"faculty_id": f2["id"], "subject_id": sub2["id"]}, headers=self.headers)
        self.client.post("/api/faculty-subjects", json={"faculty_id": f2["id"], "subject_id": sub3["id"]}, headers=self.headers)
        self.client.post("/api/faculty-subjects", json={"faculty_id": f3["id"], "subject_id": sub1["id"]}, headers=self.headers)
        self.client.post("/api/faculty-subjects", json={"faculty_id": f3["id"], "subject_id": sub4["id"]}, headers=self.headers)

        # Step 6: Add 2 classrooms and 1 laboratory
        self.client.post("/api/rooms", json={"name": "CR-101", "room_type": "classroom", "capacity": 60}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "CR-102", "room_type": "classroom", "capacity": 60}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "LAB-201", "room_type": "lab", "capacity": 30}, headers=self.headers)

        # Step 7: Create course requirements
        # For CS-Sec-A
        self.client.post("/api/course-offerings", json={"class_id": s1["id"], "subject_id": sub1["id"], "faculty_id": f1["id"], "weekly_periods": 4, "requires_lab": False}, headers=self.headers)
        self.client.post("/api/course-offerings", json={"class_id": s1["id"], "subject_id": sub2["id"], "faculty_id": f2["id"], "weekly_periods": 4, "requires_lab": False}, headers=self.headers)
        self.client.post("/api/course-offerings", json={"class_id": s1["id"], "subject_id": sub4["id"], "faculty_id": f3["id"], "weekly_periods": 2, "requires_lab": True}, headers=self.headers)
        # For CS-Sec-B
        self.client.post("/api/course-offerings", json={"class_id": s2["id"], "subject_id": sub2["id"], "faculty_id": f2["id"], "weekly_periods": 4, "requires_lab": False}, headers=self.headers)
        self.client.post("/api/course-offerings", json={"class_id": s2["id"], "subject_id": sub3["id"], "faculty_id": f2["id"], "weekly_periods": 4, "requires_lab": False}, headers=self.headers)
        self.client.post("/api/course-offerings", json={"class_id": s2["id"], "subject_id": sub4["id"], "faculty_id": f3["id"], "weekly_periods": 2, "requires_lab": True}, headers=self.headers)

        # Check Academic Overview
        overview = self.client.get("/api/academic-data/overview").json()
        self.assertEqual(overview["sections_count"], 2)
        self.assertEqual(overview["subjects_count"], 4)
        self.assertEqual(overview["faculty_count"], 3)
        self.assertEqual(overview["rooms_count"], 3)
        self.assertEqual(overview["offerings_count"], 6)
        self.assertTrue(overview["ready_for_scheduling"])

        # Step 8: Configure 5 working days and 7 periods
        periods = [
            {"name": f"Period {p}", "start_time": f"{8+p:02d}:00", "end_time": f"{8+p:02d}:50"}
            for p in range(1, 8)
        ]
        days = [
            {"day": d, "slots": periods}
            for d in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
        ]
        cfg_res = self.client.put("/api/timetable/configurations/1", json={"days": days}, headers=self.headers)
        self.assertEqual(cfg_res.status_code, 200)

        # Step 9: Generate timetable using actual entered records
        gen_res = self.client.post("/api/timetable/generate", json={
            "scope": "class",
            "class_id": s1["id"],
            "max_time_seconds": 10,
        }, headers=self.headers)
        self.assertEqual(gen_res.status_code, 200)
        data = gen_res.json()

        # Step 10: Verify generated timetable and independent clash validation
        self.assertEqual(data["status"], "success")
        self.assertIn(data["solver_status"], ["optimal", "feasible"])
        self.assertIn("solve_time_seconds", data)
        self.assertEqual(data["required_sessions_count"], 10)
        self.assertEqual(data["scheduled_sessions_count"], 10)
        self.assertEqual(data["weekly_sessions_scheduled"], 10)  # 4 + 4 + 2 = 10 periods
        self.assertTrue(data["validation"]["is_valid"])
        self.assertEqual(data["validation"]["total_clashes"], 0)
        self.assertEqual(data["validation"]["faculty_clashes"], 0)
        self.assertEqual(data["validation"]["room_clashes"], 0)
        self.assertEqual(data["validation"]["section_clashes"], 0)
        self.assertEqual(data["validation"]["eligibility_violations"], 0)

    # -------------------- 8. Infeasible Scenarios & Error Rejections --------------------
    def test_infeasible_schedule_insufficient_periods_rejected(self):
        """Verify solver/pre-check rejects generation when required periods exceed available time slots."""
        # Setup section, subject, faculty, room
        sec = self.client.post("/api/sections", json={"name": "INF-SEC-1", "department": "CS", "academic_year": 1, "semester": 2}, headers=self.headers).json()
        sub = self.client.post("/api/subjects", json={"code": "INF101", "name": "Calculus", "department": "CS"}, headers=self.headers).json()
        fac = self.client.post("/api/faculty", json={"employee_id": "INF-F1", "name": "Dr. Math", "email": "math@opti.edu", "department": "CS"}, headers=self.headers).json()
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "INF-CR-1", "room_type": "classroom", "capacity": 50}, headers=self.headers)

        # Requirement: 5 periods
        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 5, "requires_lab": False,
        }, headers=self.headers)

        # Configuration: Only 2 slots available for the entire week
        tiny_schedule = [
            {"day": "Monday", "slots": [
                {"name": "Period 1", "start_time": "09:00", "end_time": "09:50"},
                {"name": "Period 2", "start_time": "10:00", "end_time": "10:50"},
            ]}
        ]
        self.client.put("/api/timetable/configurations/2", json={"days": tiny_schedule}, headers=self.headers)

        # Generate -> Expect HTTP 400 with capacity warning
        res = self.client.post("/api/timetable/generate", json={
            "scope": "class",
            "class_id": sec["id"],
        }, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("requires 5 weekly periods", res.json()["detail"])
        self.assertIn("only provides 2 periods", res.json()["detail"])

    def test_infeasible_schedule_missing_lab_room_rejected(self):
        """Verify solver rejects lab subject generation when no laboratory room exists."""
        sec = self.client.post("/api/sections", json={"name": "NOLAB-SEC", "department": "CS", "academic_year": 1, "semester": 3}, headers=self.headers).json()
        sub = self.client.post("/api/subjects", json={"code": "NOLAB101", "name": "Physics Lab", "department": "CS"}, headers=self.headers).json()
        fac = self.client.post("/api/faculty", json={"employee_id": "NOLAB-F1", "name": "Dr. Lab", "email": "lab@opti.edu", "department": "CS"}, headers=self.headers).json()
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac["id"], "subject_id": sub["id"]}, headers=self.headers)
        # Add ONLY a classroom, NO lab
        self.client.post("/api/rooms", json={"name": "CLASSROOM-ONLY", "room_type": "classroom", "capacity": 50}, headers=self.headers)

        self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac["id"],
            "weekly_periods": 2, "requires_lab": True,
        }, headers=self.headers)

        res = self.client.post("/api/timetable/generate", json={
            "scope": "class",
            "class_id": sec["id"],
        }, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("No active laboratory room is available", res.json()["detail"])

    def test_unqualified_faculty_assignment_rejected(self):
        """Verify course offering and solver reject assigning a faculty member not qualified for the subject."""
        sec = self.client.post("/api/sections", json={"name": "UNQ-SEC", "department": "CS", "academic_year": 1, "semester": 4}, headers=self.headers).json()
        sub = self.client.post("/api/subjects", json={"code": "UNQ101", "name": "Quantum Computing", "department": "CS"}, headers=self.headers).json()
        fac_unqualified = self.client.post("/api/faculty", json={"employee_id": "UNQ-F1", "name": "Dr. History", "email": "hist@opti.edu", "department": "Humanities"}, headers=self.headers).json()
        fac_qualified = self.client.post("/api/faculty", json={"employee_id": "UNQ-F2", "name": "Dr. Physics", "email": "phys@opti.edu", "department": "CS"}, headers=self.headers).json()
        
        # Dr. Physics is qualified for UNQ101, but Dr. History is NOT
        self.client.post("/api/faculty-subjects", json={"faculty_id": fac_qualified["id"], "subject_id": sub["id"]}, headers=self.headers)
        self.client.post("/api/rooms", json={"name": "UNQ-CR", "room_type": "classroom", "capacity": 50}, headers=self.headers)

        # Attempt to create course offering with unqualified faculty Dr. History -> Expect 400 rejection
        res_off = self.client.post("/api/course-offerings", json={
            "class_id": sec["id"], "subject_id": sub["id"], "faculty_id": fac_unqualified["id"],
            "weekly_periods": 3, "requires_lab": False,
        }, headers=self.headers)
        self.assertEqual(res_off.status_code, 400)
        self.assertIn("is not qualified to teach subject", res_off.json()["detail"])

