import os

# Ensure isolated in-memory SQLite database is used for tests, never connecting to Neon.
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user
from app.db.session import Base, engine, SessionLocal
from app.models import ClassSection, Room, Subject, Faculty, FacultySubject, CourseOffering


class TestAuthSecurity(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides.clear()
        # Create all tables in the isolated in-memory database
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()

        # Create isolated synthetic fixtures
        self.section = ClassSection(
            name="TEST-CS-S1-A",
            department="Computer Science",
            academic_year=1,
            semester=1,
            is_active=True,
        )
        self.db.add(self.section)

        self.room = Room(
            name="TEST-CR-101",
            room_type="classroom",
            capacity=60,
            is_active=True,
        )
        self.db.add(self.room)

        self.subject1 = Subject(
            code="TEST-CS101",
            name="Test Computer Science I",
            department="Computer Science",
        )
        self.subject2 = Subject(
            code="TEST-CS102",
            name="Test Computer Science II",
            department="Computer Science",
        )
        self.db.add_all([self.subject1, self.subject2])

        self.faculty = Faculty(
            employee_id="TEST-FAC-001",
            name="Dr. Test Scientist",
            email="test.scientist@optisched.test",
            department="Computer Science",
            is_active=True,
        )
        self.db.add(self.faculty)
        self.db.flush()

        self.db.add_all([
            FacultySubject(faculty_id=self.faculty.id, subject_id=self.subject1.id),
            FacultySubject(faculty_id=self.faculty.id, subject_id=self.subject2.id),
        ])

        self.db.add_all([
            CourseOffering(
                class_id=self.section.id,
                subject_id=self.subject1.id,
                faculty_id=self.faculty.id,
                weekly_periods=5,
                requires_lab=False,
            ),
            CourseOffering(
                class_id=self.section.id,
                subject_id=self.subject2.id,
                faculty_id=self.faculty.id,
                weekly_periods=5,
                requires_lab=False,
            ),
        ])
        self.db.commit()

        self.section_id = self.section.id
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        app.dependency_overrides.clear()

    def test_public_endpoints_allowed_without_token(self):
        """Verify read-only endpoints are accessible without auth."""
        r_health = self.client.get("/api/health")
        self.assertEqual(r_health.status_code, 200)

        r_sections = self.client.get("/api/sections")
        self.assertEqual(r_sections.status_code, 200)

        r_configs = self.client.get("/api/timetable/configurations")
        self.assertEqual(r_configs.status_code, 200)

    def test_protected_endpoints_reject_missing_token(self):
        """Verify mutating endpoints return 401 when Authorization header is absent."""
        # 1. Timetable Generation
        r_gen = self.client.post(
            "/api/timetable/generate",
            json={"scope": "section", "class_id": self.section_id},
        )
        self.assertEqual(r_gen.status_code, 401)
        self.assertIn("Authentication required", r_gen.json()["detail"])

        # 2. Timetable Configuration Save
        r_cfg = self.client.put(
            f"/api/timetable/configurations/{self.section.semester}",
            json={
                "days": [{"day": "Monday", "slots": [{"name": "P1", "start_time": "09:00", "end_time": "09:50"}]}]
            },
        )
        self.assertEqual(r_cfg.status_code, 401)
        self.assertIn("Authentication required", r_cfg.json()["detail"])

        # 3. Timetable Configuration Delete
        r_del = self.client.delete(f"/api/timetable/configurations/{self.section.semester}")
        self.assertEqual(r_del.status_code, 401)

        # 4. Entity creations
        r_fac = self.client.post("/api/faculty", json={"employee_id": "T1", "name": "T", "email": "t@t.com", "department": "D"})
        self.assertEqual(r_fac.status_code, 401)

    def test_protected_endpoints_reject_invalid_token(self):
        """Verify mutating endpoints return 401 when an invalid/tampered token is passed."""
        headers = {"Authorization": "Bearer totally_bogus_token_12345"}
        r = self.client.post(
            "/api/timetable/generate",
            json={"scope": "section", "class_id": self.section_id},
            headers=headers,
        )
        self.assertEqual(r.status_code, 401)
        self.assertTrue(
            "Unauthorized" in r.json()["detail"] or "Token verification failed" in r.json()["detail"]
        )

    def test_protected_endpoints_succeed_with_valid_token(self):
        """Verify mutating endpoints succeed when a valid authenticated session is verified."""
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "user_verified_demo",
            "session_id": "sess_demo",
            "payload": {"sub": "user_verified_demo"},
        }
        try:
            r = self.client.post(
                "/api/timetable/generate",
                json={"scope": "section", "class_id": self.section_id},
                headers={"Authorization": "Bearer valid_mocked_token"},
            )
            self.assertEqual(r.status_code, 200)
            data = r.json()
            self.assertIn(data["solver_status"], ["optimal", "feasible"])
            self.assertEqual(data["weekly_sessions_scheduled"], 10)
            self.assertTrue(data["validation"]["verified"])
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
