import os

# Ensure isolated in-memory SQLite database is used for tests, never connecting to Neon.
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
if "CLERK_SECRET_KEY" not in os.environ:
    os.environ["CLERK_SECRET_KEY"] = "sk_test_mock_test_key_for_testing"

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import get_current_user, extract_role_from_payload
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
            email="test.scientist@optisched.edu",
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

    # -------------------- Baseline Authentication Tests --------------------
    def test_public_endpoints_allowed_without_token(self):
        """Verify intentionally public read-only endpoints are accessible without auth."""
        r_health = self.client.get("/api/health")
        self.assertEqual(r_health.status_code, 200)

        r_sections = self.client.get("/api/sections")
        self.assertEqual(r_sections.status_code, 200)

        r_configs = self.client.get("/api/timetable/configurations")
        self.assertEqual(r_configs.status_code, 200)

        r_faculty = self.client.get("/api/faculty")
        self.assertEqual(r_faculty.status_code, 200)

    def test_protected_endpoints_reject_missing_token(self):
        """Verify mutating and protected endpoints return 401 when Authorization header is absent."""
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
        r_fac = self.client.post(
            "/api/faculty",
            json={"employee_id": "T1", "name": "T", "email": "t@t.com", "department": "D"},
        )
        self.assertEqual(r_fac.status_code, 401)

        r_sec = self.client.post(
            "/api/sections",
            json={"name": "S", "department": "D", "academic_year": 1, "semester": 1},
        )
        self.assertEqual(r_sec.status_code, 401)

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

    # -------------------- Role-Based Authorization Tests (Phase B1) --------------------
    def test_admin_role_can_perform_administrative_mutations(self):
        """Verify admin role can successfully execute administrative create, update, and delete endpoints."""
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "admin_user_01",
            "session_id": "sess_admin",
            "role": "admin",
            "payload": {"sub": "admin_user_01", "role": "admin"},
        }
        headers = {"Authorization": "Bearer admin_mock_token"}

        # 1. Create section as admin
        r_sec = self.client.post(
            "/api/sections",
            json={"name": "ADM-SEC-1", "department": "CS", "academic_year": 2, "semester": 3},
            headers=headers,
        )
        self.assertEqual(r_sec.status_code, 201)

        # 2. Create faculty as admin
        r_fac = self.client.post(
            "/api/faculty",
            json={"employee_id": "ADM-FAC-01", "name": "Admin Fac", "email": "admin.fac@optisched.edu", "department": "CS"},
            headers=headers,
        )
        self.assertEqual(r_fac.status_code, 201)

        # 3. Create room as admin
        r_rm = self.client.post(
            "/api/rooms",
            json={"name": "ADM-RM-01", "room_type": "classroom", "capacity": 50},
            headers=headers,
        )
        self.assertEqual(r_rm.status_code, 201)

        # 4. Save timetable config as admin
        r_cfg = self.client.put(
            f"/api/timetable/configurations/{self.section.semester}",
            json={"days": [{"day": "Monday", "slots": [{"name": "P1", "start_time": "09:00", "end_time": "09:50"}]}]},
            headers=headers,
        )
        self.assertEqual(r_cfg.status_code, 200)

        # 5. Delete timetable config as admin
        r_del = self.client.delete(
            f"/api/timetable/configurations/{self.section.semester}",
            headers=headers,
        )
        self.assertEqual(r_del.status_code, 200)

    def test_faculty_role_denied_administrative_mutations(self):
        """Verify faculty role is rejected with 403 Forbidden on administrative mutations."""
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "faculty_user_01",
            "session_id": "sess_faculty",
            "role": "faculty",
            "payload": {"sub": "faculty_user_01", "role": "faculty"},
        }
        headers = {"Authorization": "Bearer faculty_mock_token"}

        # Faculty attempting to create a section -> 403
        r_sec = self.client.post(
            "/api/sections",
            json={"name": "FAC-FORBIDDEN-SEC", "department": "CS", "academic_year": 1, "semester": 1},
            headers=headers,
        )
        self.assertEqual(r_sec.status_code, 403)
        self.assertIn("Forbidden", r_sec.json()["detail"])

        # Faculty attempting to create a faculty member -> 403
        r_fac = self.client.post(
            "/api/faculty",
            json={"employee_id": "FAC-FORBIDDEN", "name": "No Perm", "email": "noperm@optisched.edu", "department": "CS"},
            headers=headers,
        )
        self.assertEqual(r_fac.status_code, 403)
        self.assertIn("Forbidden", r_fac.json()["detail"])

        # Faculty attempting to delete a configuration -> 403
        r_del = self.client.delete(
            f"/api/timetable/configurations/{self.section.semester}",
            headers=headers,
        )
        self.assertEqual(r_del.status_code, 403)
        self.assertIn("Forbidden", r_del.json()["detail"])

        # Faculty attempting to update a configuration -> 403
        r_put_cfg = self.client.put(
            f"/api/timetable/configurations/{self.section.semester}",
            json={"days": [{"day": "Monday", "slots": [{"name": "P1", "start_time": "09:00", "end_time": "09:50"}]}]},
            headers=headers,
        )
        self.assertEqual(r_put_cfg.status_code, 403)

    def test_student_role_denied_administrative_mutations(self):
        """Verify student role is rejected with 403 Forbidden on administrative mutations."""
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "student_user_01",
            "session_id": "sess_student",
            "role": "student",
            "payload": {"sub": "student_user_01", "role": "student"},
        }
        headers = {"Authorization": "Bearer student_mock_token"}

        # Student attempting to create room -> 403
        r_rm = self.client.post(
            "/api/rooms",
            json={"name": "STUDENT-FORBIDDEN-RM", "room_type": "classroom", "capacity": 30},
            headers=headers,
        )
        self.assertEqual(r_rm.status_code, 403)
        self.assertIn("Forbidden", r_rm.json()["detail"])

        # Student attempting to create subject -> 403
        r_sub = self.client.post(
            "/api/subjects",
            json={"code": "STUDENT-CS999", "name": "Fake Subject", "department": "CS"},
            headers=headers,
        )
        self.assertEqual(r_sub.status_code, 403)
        self.assertIn("Forbidden", r_sub.json()["detail"])

        # Student attempting to delete faculty -> 403
        r_del = self.client.delete(f"/api/faculty/{self.faculty.id}", headers=headers)
        self.assertEqual(r_del.status_code, 403)
        self.assertIn("Forbidden", r_del.json()["detail"])

    def test_faculty_and_student_roles_permitted_to_generate_timetable(self):
        """Verify all valid authenticated roles (admin, faculty, student) can access timetable generation."""
        # 1. Faculty generation
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "faculty_user_01",
            "session_id": "sess_fac",
            "role": "faculty",
            "payload": {"sub": "faculty_user_01", "role": "faculty"},
        }
        r_fac = self.client.post(
            "/api/timetable/generate",
            json={"scope": "section", "class_id": self.section_id},
            headers={"Authorization": "Bearer faculty_token"},
        )
        self.assertEqual(r_fac.status_code, 200)
        self.assertIn(r_fac.json()["solver_status"], ["optimal", "feasible"])

        # 2. Student generation
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "student_user_01",
            "session_id": "sess_stu",
            "role": "student",
            "payload": {"sub": "student_user_01", "role": "student"},
        }
        r_stu = self.client.post(
            "/api/timetable/generate",
            json={"scope": "section", "class_id": self.section_id},
            headers={"Authorization": "Bearer student_token"},
        )
        self.assertEqual(r_stu.status_code, 200)
        self.assertIn(r_stu.json()["solver_status"], ["optimal", "feasible"])

    def test_unrecognized_role_denied_on_role_guarded_endpoints(self):
        """Verify unrecognized or arbitrary role claims fail closed with 403."""
        app.dependency_overrides[get_current_user] = lambda: {
            "user_id": "anon_user_99",
            "session_id": "sess_anon",
            "role": "hacker_guest",
            "payload": {"sub": "anon_user_99", "role": "hacker_guest"},
        }
        r = self.client.post(
            "/api/timetable/generate",
            json={"scope": "section", "class_id": self.section_id},
            headers={"Authorization": "Bearer custom_role_token"},
        )
        self.assertEqual(r.status_code, 403)
        self.assertIn("Forbidden", r.json()["detail"])

    # -------------------- Direct Unit Tests: Role Extraction Helper --------------------
    def test_extract_role_from_payload(self):
        """Verify role resolution priority, case-insensitivity, and fail-closed defaults."""
        # Direct role claims
        self.assertEqual(extract_role_from_payload({"role": "admin"}), "admin")
        self.assertEqual(extract_role_from_payload({"role": "ADMIN"}), "admin")
        self.assertEqual(extract_role_from_payload({"role": "faculty"}), "faculty")
        self.assertEqual(extract_role_from_payload({"role": "teacher"}), "faculty")
        self.assertEqual(extract_role_from_payload({"role": "professor"}), "faculty")
        self.assertEqual(extract_role_from_payload({"role": "student"}), "student")

        # Nested metadata claims (standard Clerk session metadata)
        self.assertEqual(extract_role_from_payload({"metadata": {"role": "admin"}}), "admin")
        self.assertEqual(extract_role_from_payload({"public_metadata": {"role": "faculty"}}), "faculty")
        self.assertEqual(extract_role_from_payload({"publicMetadata": {"role": "admin"}}), "admin")
        self.assertEqual(extract_role_from_payload({"org_role": "admin"}), "admin")

        # Email fallback heuristics
        self.assertEqual(extract_role_from_payload({"email": "admin@university.edu"}), "admin")
        self.assertEqual(extract_role_from_payload({"email": "dean+admin@optisched.edu"}), "admin")
        self.assertEqual(extract_role_from_payload({"email": "faculty.member@university.edu"}), "faculty")
        self.assertEqual(extract_role_from_payload({"email": "prof.smith@optisched.edu"}), "faculty")
        self.assertEqual(extract_role_from_payload({"email": "student123@university.edu"}), "student")

        # Fail-closed default for empty or malicious role
        self.assertEqual(extract_role_from_payload({}), "student")
        self.assertEqual(extract_role_from_payload({"role": "super_root_injected"}), "student")
        self.assertEqual(extract_role_from_payload({"role": 12345}), "student")

    # -------------------- Direct Unit Tests: Bcrypt Account Login & Security --------------------
    def test_bcrypt_account_authentication(self):
        """Verify bcrypt password hashing, login endpoint, plaintext-hash rejection, and no demo bypass."""
        from app.models.user import User
        from app.core import security
        from app.core.security import hash_password, verify_password

        self.assertFalse(
            hasattr(security, "VALID_DEMO_CREDENTIALS"),
            "Hardcoded demo credentials fallback must not exist in security module",
        )

        accounts = [
            ("synth.admin@example.com", "SynthAdminPass#101!", "admin", "/admin"),
            ("synth.faculty@example.com", "SynthFacPass#202!", "faculty", "/faculty"),
            ("synth.student@example.com", "SynthStuPass#303!", "student", "/student"),
        ]

        # 1. Seed synthetic test accounts in isolated test DB
        for email, pwd, role, _ in accounts:
            pwd_hash = hash_password(pwd)
            self.assertTrue(pwd_hash.startswith("$2b$") or pwd_hash.startswith("$2a$"))
            user = User(email=email, password_hash=pwd_hash, role=role, is_active=True)
            self.db.add(user)
        self.db.commit()

        # 2. Test successful login with valid bcrypt hashes
        for email, pwd, role, dashboard in accounts:
            res = self.client.post("/api/auth/login", json={"email": email, "password": pwd})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["user"]["role"], role)
            self.assertEqual(data["target_dashboard"], dashboard)

        # 3. Test wrong password rejected (401)
        res_wrong = self.client.post(
            "/api/auth/login",
            json={"email": "synth.admin@example.com", "password": "WrongPassword!999"},
        )
        self.assertEqual(res_wrong.status_code, 401)
        self.assertIn("Invalid email or password", res_wrong.json()["detail"])

        # 4. Test non-existent email rejected (401)
        res_none = self.client.post(
            "/api/auth/login",
            json={"email": "nonexistent@example.com", "password": "AnyPassword!123"},
        )
        self.assertEqual(res_none.status_code, 401)
        self.assertIn("Invalid email or password", res_none.json()["detail"])

        # 5. Test rejection of plaintext passwords stored directly in password_hash
        plaintext_secret = "PlaintextStoredPass#555"
        self.assertFalse(verify_password(plaintext_secret, plaintext_secret))
        plaintext_user = User(
            email="plaintext.user@example.com",
            password_hash=plaintext_secret,
            role="student",
            is_active=True,
        )
        self.db.add(plaintext_user)
        self.db.commit()

        res_plain = self.client.post(
            "/api/auth/login",
            json={"email": "plaintext.user@example.com", "password": plaintext_secret},
        )
        self.assertEqual(res_plain.status_code, 401)

        # 6. Test that admin@optisched.com strictly enforces its stored bcrypt hash (no fallback bypass)
        strict_user = User(
            email="admin@optisched.com",
            password_hash=hash_password("StrictSynthPass#777!"),
            role="admin",
            is_active=True,
        )
        self.db.add(strict_user)
        self.db.commit()

        res_ok = self.client.post(
            "/api/auth/login",
            json={"email": "admin@optisched.com", "password": "StrictSynthPass#777!"},
        )
        self.assertEqual(res_ok.status_code, 200)

        res_bypass = self.client.post(
            "/api/auth/login",
            json={"email": "admin@optisched.com", "password": "UnrelatedPassword#000"},
        )
        self.assertEqual(res_bypass.status_code, 401)

    def test_seed_demo_accounts_requires_env_vars_and_preserves_existing(self):
        """Verify demo seed script rejects missing env vars and preserves existing user hashes."""
        import importlib
        import seed_demo_accounts
        from app.models.user import User
        from app.core.security import hash_password, verify_password

        env_keys = [
            "DEMO_ADMIN_PASSWORD",
            "DEMO_FACULTY_PASSWORD",
            "DEMO_STUDENT_PASSWORD",
        ]
        saved = {k: os.environ.pop(k, None) for k in env_keys}
        try:
            importlib.reload(seed_demo_accounts)
            with self.assertRaises(ValueError):
                seed_demo_accounts.load_demo_accounts_from_env()

            os.environ["DEMO_ADMIN_PASSWORD"] = "TestSeedAdmin#111"
            os.environ["DEMO_FACULTY_PASSWORD"] = "TestSeedFac#222"
            os.environ["DEMO_STUDENT_PASSWORD"] = "TestSeedStu#333"

            accounts = seed_demo_accounts.load_demo_accounts_from_env()
            self.assertEqual(len(accounts), 3)

            # Pre-create admin with an existing password that must NOT be overwritten by default
            existing = User(
                email="admin@optisched.com",
                password_hash=hash_password("ExistingPreserved#999"),
                role="admin",
                is_active=True,
            )
            self.db.add(existing)
            self.db.commit()

            results = seed_demo_accounts.sync_demo_accounts(
                accounts, update_existing=False, db_session=self.db
            )
            status_by_email = {r["email"]: r["status"] for r in results}
            self.assertEqual(status_by_email["admin@optisched.com"], "SKIPPED_EXISTS")
            self.assertEqual(status_by_email["faculty@optisched.com"], "CREATED")
            self.assertEqual(status_by_email["student@optisched.com"], "CREATED")

            # Existing admin password remains intact
            refreshed_admin = self.db.query(User).filter(User.email == "admin@optisched.com").first()
            self.assertTrue(verify_password("ExistingPreserved#999", refreshed_admin.password_hash))
            self.assertFalse(verify_password("TestSeedAdmin#111", refreshed_admin.password_hash))
        finally:
            for k, val in saved.items():
                if val is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = val

    # -------------------- Direct Unit Tests: ULID Generation & User APIs --------------------
    def test_ulid_generation_properties(self):
        """Verify ULIDs are strictly 26 characters, Crockford Base32 compliant, and unique."""
        from app.core.ulid import generate_ulid, is_valid_ulid

        ids = [generate_ulid() for _ in range(500)]
        self.assertEqual(len(ids), len(set(ids)), "Collision detected in ULID generation")

        for uid in ids:
            self.assertEqual(len(uid), 26, f"ULID length {len(uid)} != 26")
            self.assertTrue(is_valid_ulid(uid), f"Invalid ULID: {uid}")

    def test_user_model_ulid_auto_assignment(self):
        """Verify User model assigns a 26-character ULID automatically on creation."""
        from app.models.user import User
        from app.core.ulid import is_valid_ulid
        from app.core.security import hash_password

        new_user = User(
            email="auto.ulid@optisched.com",
            password_hash=hash_password("Pass123!"),
            role="student",
        )
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)

        self.assertIsNotNone(new_user.id)
        self.assertEqual(len(new_user.id), 26)
        self.assertTrue(is_valid_ulid(new_user.id))

    def test_user_creation_and_retrieval_api(self):
        """Verify User CRUD endpoints: creating admin/faculty/student assigns 26-char ULID."""
        from app.core.ulid import is_valid_ulid

        test_roles = [
            ("newadmin@optisched.com", "AdminPass123!", "admin", "Admin User"),
            ("newfaculty@optisched.com", "FacultyPass123!", "faculty", "Prof. Tester"),
            ("newstudent@optisched.com", "StudentPass123!", "student", "Student Tester"),
        ]

        created_ids = []
        for email, pwd, role, name in test_roles:
            res = self.client.post(
                "/api/users",
                json={"email": email, "password": pwd, "role": role, "name": name},
            )
            self.assertEqual(res.status_code, 201)
            data = res.json()
            self.assertEqual(data["email"], email)
            self.assertEqual(data["role"], role)
            self.assertEqual(data["name"], name)
            self.assertEqual(len(data["id"]), 26)
            self.assertTrue(is_valid_ulid(data["id"]))
            self.assertEqual(data["id_str"], data["id"])
            created_ids.append(data["id"])

        # Check retrieval by ULID
        for uid in created_ids:
            res_get = self.client.get(f"/api/users/{uid}")
            self.assertEqual(res_get.status_code, 200)
            self.assertEqual(res_get.json()["id"], uid)

        # Check list endpoint
        res_list = self.client.get("/api/users")
        self.assertEqual(res_list.status_code, 200)
        users_list = res_list.json()
        listed_ids = [u["id"] for u in users_list]
        for uid in created_ids:
            self.assertIn(uid, listed_ids)

    def test_password_policy_minimum_8_characters_enforced(self):
        """Verify strict 8-character password policy on schema, hashing, registration, and login."""
        from app.core.security import validate_password_policy, hash_password, MIN_PASSWORD_LENGTH

        self.assertEqual(MIN_PASSWORD_LENGTH, 8)

        # 1. Direct policy function rejects < 8 chars and accepts >= 8 chars
        with self.assertRaises(ValueError):
            validate_password_policy("1234567")
        with self.assertRaises(ValueError):
            hash_password("short")

        # 8-character password must pass
        valid_8 = "Pass#123"
        self.assertEqual(len(valid_8), 8)
        pwd_hash = hash_password(valid_8)
        self.assertTrue(pwd_hash.startswith(("$2b$", "$2a$", "$2y$")))

        # 2. Registration API rejects < 8 characters (HTTP 422 Unprocessable Entity)
        res_short = self.client.post(
            "/api/users",
            json={"email": "short@optisched.com", "password": "short7!", "role": "student"},
        )
        self.assertEqual(res_short.status_code, 422)

        # 3. Login API rejects < 8 characters (HTTP 422 Unprocessable Entity)
        res_login_short = self.client.post(
            "/api/auth/login",
            json={"email": "synth.admin@example.com", "password": "short"},
        )
        self.assertEqual(res_login_short.status_code, 422)

        # 4. Password policy endpoint returns min_length 8
        res_policy = self.client.get("/api/auth/password-policy")
        self.assertEqual(res_policy.status_code, 200)
        self.assertEqual(res_policy.json()["min_length"], 8)
        self.assertEqual(res_policy.json()["algorithm"], "bcrypt")

    def test_user_update_delete_and_system_monitoring(self):
        """Verify User update/delete endpoints and Admin system monitoring analytics."""
        # 1. Create a user
        res_create = self.client.post(
            "/api/users",
            json={"email": "temp.admin@optisched.com", "password": "TempAdminPass1!", "role": "admin", "name": "Temp Admin"},
        )
        self.assertEqual(res_create.status_code, 201)
        uid = res_create.json()["id"]

        # 2. Update user name and password (with valid 8+ chars)
        res_update = self.client.put(
            f"/api/users/{uid}",
            json={"name": "Updated Admin Name", "password": "NewSecret88!"},
        )
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["name"], "Updated Admin Name")

        # Updating with short password (< 8 chars) must fail with 422
        res_update_short = self.client.put(
            f"/api/users/{uid}",
            json={"password": "tiny1"},
        )
        self.assertEqual(res_update_short.status_code, 422)

        # 3. Verify Admin System Monitoring endpoint
        res_status = self.client.get("/api/admin/system/status")
        self.assertEqual(res_status.status_code, 200)
        status_data = res_status.json()
        self.assertEqual(status_data["status"], "healthy")
        self.assertEqual(status_data["password_policy"]["min_length"], 8)
        self.assertEqual(status_data["password_policy"]["hashing_algorithm"], "bcrypt")
        self.assertIn("analytics", status_data)
        self.assertGreaterEqual(status_data["analytics"]["total_users"], 1)

        # 4. Delete user
        res_del = self.client.delete(f"/api/users/{uid}")
        self.assertEqual(res_del.status_code, 200)

        # Confirm deleted
        res_get_deleted = self.client.get(f"/api/users/{uid}")
        self.assertEqual(res_get_deleted.status_code, 404)

    def test_init_admin_environment_provisioning(self):
        """Verify Admin account creation/initialization via init_admin module."""
        import init_admin

        # Test rejection of < 8 character admin password
        with self.assertRaises(ValueError):
            init_admin.ensure_admin_user_exists(
                email="admin.short@optisched.com",
                password="short",
                force_update_password=True,
                db_session=self.db,
            )

        # Test successful admin creation with 8+ chars
        res = init_admin.ensure_admin_user_exists(
            email="env.admin@optisched.com",
            password="ValidAdminPass#99",
            name="Environment Administrator",
            force_update_password=True,
            db_session=self.db,
        )
        self.assertEqual(res["role"], "admin")
        self.assertEqual(res["email"], "env.admin@optisched.com")
        self.assertTrue(res["is_bcrypt"])
        self.assertTrue(res["login_verified"])


if __name__ == "__main__":
    unittest.main()
