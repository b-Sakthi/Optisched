export type ApiScheduleEntry = {
  day: string;
  period: string;
  start_time: string;
  end_time: string;
  class_id: number;
  class_name: string;
  department: string;
  semester: number;
  subject_id?: number;
  subject_code: string;
  subject_name: string;
  faculty_id?: number;
  faculty_name: string;
  room_id?: number;
  room_name: string;
  room_type: string;
  occurrence: number;
};

export type ValidationReport = {
  is_valid: boolean;
  total_clashes: number;
  faculty_clashes: number;
  room_clashes: number;
  section_clashes: number;
  eligibility_violations: number;
  details: {
    faculty_clashes: string[];
    room_clashes: string[];
    section_clashes: string[];
    eligibility_violations: string[];
  };
  verified: boolean;
};

export type GenerateResponse = {
  status: string;
  solver_status: "optimal" | "feasible";
  solve_time_seconds?: number;
  required_sessions_count?: number;
  scheduled_sessions_count?: number;
  scope: string;
  working_hours: string;
  scheduled_span?: string;
  configuration_status?: "saved" | "fallback" | "custom_request" | "mixed";
  is_custom_configured?: boolean;
  configured_semesters?: number[];
  unconfigured_semesters?: number[];
  sections_scheduled: number;
  weekly_sessions_scheduled: number;
  schedule: ApiScheduleEntry[];
  notes: string[];
  validation?: ValidationReport;
};

export type ScheduleEntry = {
  day: string;
  period: number;
  periodName: string;
  startTime: string;
  endTime: string;
  subject: string;
  faculty: string;
  room: string;
  type: "Lecture" | "Lab" | "Tutorial";
  className: string;
  subjectCode: string;
  department?: string;
  semester?: number;
};

export type Section = {
  id: number;
  name: string;
  department: string;
  academic_year: number;
  semester: number;
  student_count?: number;
  is_active: boolean;
  offerings_count?: number;
};

export type Subject = {
  id: number;
  code: string;
  name: string;
  department: string;
  qualifications_count?: number;
  offerings_count?: number;
};

export type Room = {
  id: number;
  name: string;
  room_type: "classroom" | "lab" | "lecture_hall" | string;
  capacity: number;
  building?: string | null;
  is_active: boolean;
};

export type CourseOffering = {
  id: number;
  class_id: number;
  class_name?: string;
  department?: string;
  semester?: number;
  subject_id: number;
  subject_code?: string;
  subject_name?: string;
  faculty_id: number;
  faculty_name?: string;
  weekly_periods: number;
  requires_lab: boolean;
};

export type FacultyMember = {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
  weekly_workload: number;
  qualifications: {
    subject_id: number;
    code: string;
    name: string;
    department: string;
  }[];
};

export type FacultySubjectMapping = {
  id: number;
  faculty_id: number;
  faculty_name?: string;
  employee_id?: string;
  subject_id: number;
  subject_code?: string;
  subject_name?: string;
};

export type AcademicOverview = {
  sections_count: number;
  active_sections_count: number;
  subjects_count: number;
  faculty_count: number;
  active_faculty_count: number;
  rooms_count: number;
  classrooms_count: number;
  labs_count: number;
  qualifications_count: number;
  offerings_count: number;
  departments: string[];
  ready_for_scheduling: boolean;
  readiness_details: string[];
};

export type CsvImportPreviewResult = {
  entity: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  valid_rows: Array<{
    row: number;
    model_data: Record<string, unknown>;
    display?: Record<string, unknown>;
  }>;
  invalid_rows: Array<{
    row: number;
    data: Record<string, unknown>;
    errors: string[];
  }>;
  can_import: boolean;
  summary: string;
};

export type User = {
  id: string; // 26-character ULID
  id_str?: string;
  email: string;
  role: "admin" | "faculty" | "student";
  name?: string | null;
  is_active?: boolean;
};

export type AuthLoginResponse = {
  status: string;
  message: string;
  user: User;
  target_dashboard: string;
};

export type FacultyAvailability = {
  id: number;
  faculty_id: number;
  faculty_name?: string;
  employee_id?: string;
  day: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  reason?: string | null;
};

export type PublishedTimetable = {
  id: number;
  title: string;
  version: number;
  scope: string;
  class_id?: number | null;
  department?: string | null;
  semester?: number | null;
  working_hours: string;
  solver_status: string;
  solve_time_seconds?: number | null;
  sections_scheduled: number;
  weekly_sessions_scheduled: number;
  is_active: boolean;
  published_by?: string | null;
  created_at: string;
  schedule?: ApiScheduleEntry[];
};

