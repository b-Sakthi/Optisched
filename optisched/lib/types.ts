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
  is_active: boolean;
};

export type Subject = {
  id: number;
  code: string;
  name: string;
  department: string;
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
  subject_id: number;
  faculty_id: number;
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
