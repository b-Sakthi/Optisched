"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  GraduationCap,
  BookOpen,
  Users,
  Building,
  Layers,
  FileSpreadsheet,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Upload,
  Check,
  RefreshCw,
  Sparkles,
  Link2,
  ShieldAlert,
  Sliders,
  Clock,
} from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/api";
import {
  Section,
  Subject,
  Room,
  CourseOffering,
  FacultyMember,
  FacultySubjectMapping,
  AcademicOverview,
  CsvImportPreviewResult,
  FacultyAvailability,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface AcademicDataManagementProps {
  onNavigateToTimetable?: () => void;
  onNavigateToSettings?: () => void;
}

export function AcademicDataManagement({
  onNavigateToTimetable,
  onNavigateToSettings,
}: AcademicDataManagementProps) {
  const { getToken } = useAuth();

  // Active Sub-tab
  const [subTab, setSubTab] = useState<
    "sections" | "subjects" | "faculty" | "availability" | "mappings" | "rooms" | "requirements" | "csv"
  >("sections");

  // Live Data State
  const [overview, setOverview] = useState<AcademicOverview | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [mappings, setMappings] = useState<FacultySubjectMapping[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [availabilities, setAvailabilities] = useState<FacultyAvailability[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [loadingDemoData, setLoadingDemoData] = useState(false);

  // Modal State
  const [modalType, setModalType] = useState<
    "create-section" | "edit-section" |
    "create-subject" | "edit-subject" |
    "create-faculty" | "edit-faculty" |
    "create-mapping" |
    "create-room" | "edit-room" |
    "create-requirement" | "edit-requirement" |
    "create-availability" |
    null
  >(null);
  const [editingItem, setEditingItem] = useState<{ id: number; [key: string]: unknown } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<{
    entity: "section" | "subject" | "faculty" | "mapping" | "room" | "requirement" | "availability";
    id: number;
    name: string;
  } | null>(null);

  // Form Fields - Sections
  const [secName, setSecName] = useState("");
  const [secDept, setSecDept] = useState("Computer Science");
  const [secYear, setSecYear] = useState(1);
  const [secSem, setSecSem] = useState(1);
  const [secStudentCount, setSecStudentCount] = useState<number>(60);
  const [secActive, setSecActive] = useState(true);

  // Form Fields - Faculty Availability
  const [availFacultyId, setAvailFacultyId] = useState<string>("");
  const [availDay, setAvailDay] = useState<string>("Monday");
  const [availStartTime, setAvailStartTime] = useState<string>("09:00");
  const [availEndTime, setAvailEndTime] = useState<string>("11:00");
  const [availReason, setAvailReason] = useState<string>("Research Duty");

  // Form Fields - Subjects
  const [subCode, setSubCode] = useState("");
  const [subName, setSubName] = useState("");
  const [subDept, setSubDept] = useState("Computer Science");

  // Form Fields - Faculty
  const [facEmpId, setFacEmpId] = useState("");
  const [facName, setFacName] = useState("");
  const [facEmail, setFacEmail] = useState("");
  const [facDept, setFacDept] = useState("Computer Science");
  const [facActive, setFacActive] = useState(true);

  // Form Fields - Mapping
  const [mapFacultyId, setMapFacultyId] = useState<string>("");
  const [mapSubjectId, setMapSubjectId] = useState<string>("");

  // Form Fields - Rooms
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("classroom");
  const [roomCapacity, setRoomCapacity] = useState(60);
  const [roomBuilding, setRoomBuilding] = useState("Academic Block");
  const [roomActive, setRoomActive] = useState(true);

  // Form Fields - Course Requirements
  const [reqClassId, setReqClassId] = useState<string>("");
  const [reqSubjectId, setReqSubjectId] = useState<string>("");
  const [reqFacultyId, setReqFacultyId] = useState<string>("");
  const [reqWeeklyPeriods, setReqWeeklyPeriods] = useState(4);
  const [reqLab, setReqLab] = useState(false);

  // CSV Import State
  const [csvEntity, setCsvEntity] = useState<"sections" | "subjects" | "faculty" | "faculty_subjects" | "rooms" | "requirements">("sections");
  const [csvContent, setCsvContent] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvImportPreviewResult | null>(null);
  const [csvValidating, setCsvValidating] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);

  // Fetch all live database records
  const refreshAllData = async () => {
    setLoading(true);
    setError("");
    try {
      const [ovRes, secRes, subRes, facRes, roomRes, mapRes, offRes, availRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/api/academic-data/overview`),
        fetchWithAuth(`${API_BASE_URL}/api/sections`),
        fetchWithAuth(`${API_BASE_URL}/api/subjects`),
        fetchWithAuth(`${API_BASE_URL}/api/faculty`),
        fetchWithAuth(`${API_BASE_URL}/api/rooms`),
        fetchWithAuth(`${API_BASE_URL}/api/faculty-subjects`),
        fetchWithAuth(`${API_BASE_URL}/api/course-offerings`),
        fetchWithAuth(`${API_BASE_URL}/api/faculty-availability`),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (secRes.ok) setSections(await secRes.json());
      if (subRes.ok) setSubjects(await subRes.json());
      if (facRes.ok) setFaculty(await facRes.json());
      if (roomRes.ok) setRooms(await roomRes.json());
      if (mapRes.ok) setMappings(await mapRes.json());
      if (offRes.ok) setOfferings(await offRes.json());
      if (availRes.ok) setAvailabilities(await availRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect to backend service");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const fetchInitialData = async () => {
      try {
        const [ovRes, secRes, subRes, facRes, roomRes, mapRes, offRes, availRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/academic-data/overview`),
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
          fetchWithAuth(`${API_BASE_URL}/api/subjects`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
          fetchWithAuth(`${API_BASE_URL}/api/rooms`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty-subjects`),
          fetchWithAuth(`${API_BASE_URL}/api/course-offerings`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty-availability`),
        ]);

        if (!ignore) {
          if (ovRes.ok) setOverview(await ovRes.json());
          if (secRes.ok) setSections(await secRes.json());
          if (subRes.ok) setSubjects(await subRes.json());
          if (facRes.ok) setFaculty(await facRes.json());
          if (roomRes.ok) setRooms(await roomRes.json());
          if (mapRes.ok) setMappings(await mapRes.json());
          if (offRes.ok) setOfferings(await offRes.json());
          if (availRes.ok) setAvailabilities(await availRes.json());
        }
      } catch (e) {
        if (!ignore) {
          setError(e instanceof Error ? e.message : "Failed to connect to backend service");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void fetchInitialData();
    return () => {
      ignore = true;
    };
  }, []);

  const departmentsList = useMemo(() => {
    const raw = [
      ...sections.map((s) => s.department),
      ...subjects.map((s) => s.department),
      ...faculty.map((f) => f.department),
    ].filter(Boolean);
    const unique = Array.from(new Set(raw));
    if (unique.length === 0) unique.push("Computer Science");
    return unique.sort();
  }, [sections, subjects, faculty]);

  // Filtered lists based on search & department
  const filteredSections = useMemo(() => {
    const q = search.toLowerCase();
    return sections.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q);
      const matchesDept = departmentFilter === "all" || s.department === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [sections, search, departmentFilter]);

  const filteredSubjects = useMemo(() => {
    const q = search.toLowerCase();
    return subjects.filter((s) => {
      const matchesSearch = s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q);
      const matchesDept = departmentFilter === "all" || s.department === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [subjects, search, departmentFilter]);

  const filteredFaculty = useMemo(() => {
    const q = search.toLowerCase();
    return faculty.filter((f) => {
      const matchesSearch =
        f.name.toLowerCase().includes(q) ||
        f.employee_id.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q) ||
        f.department.toLowerCase().includes(q);
      const matchesDept = departmentFilter === "all" || f.department === departmentFilter;
      return matchesSearch && matchesDept;
    });
  }, [faculty, search, departmentFilter]);

  const filteredRooms = useMemo(() => {
    const q = search.toLowerCase();
    return rooms.filter((r) => r.name.toLowerCase().includes(q) || (r.building || "").toLowerCase().includes(q));
  }, [rooms, search]);

  const filteredMappings = useMemo(() => {
    const q = search.toLowerCase();
    return mappings.filter((m) =>
      (m.faculty_name || "").toLowerCase().includes(q) ||
      (m.employee_id || "").toLowerCase().includes(q) ||
      (m.subject_code || "").toLowerCase().includes(q) ||
      (m.subject_name || "").toLowerCase().includes(q)
    );
  }, [mappings, search]);

  const filteredOfferings = useMemo(() => {
    const q = search.toLowerCase();
    return offerings.filter((o) =>
      (o.class_name || "").toLowerCase().includes(q) ||
      (o.subject_code || "").toLowerCase().includes(q) ||
      (o.subject_name || "").toLowerCase().includes(q) ||
      (o.faculty_name || "").toLowerCase().includes(q)
    );
  }, [offerings, search]);

  const filteredAvailabilities = useMemo(() => {
    const q = search.toLowerCase();
    return availabilities.filter((a) => {
      const matchesSearch =
        (a.faculty_name || "").toLowerCase().includes(q) ||
        (a.employee_id || "").toLowerCase().includes(q) ||
        (a.day || "").toLowerCase().includes(q) ||
        (a.reason || "").toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [availabilities, search]);

  // Open Create Modals
  const openCreateSection = () => {
    setSecName("");
    setSecDept(departmentsList[0] || "Computer Science");
    setSecYear(1);
    setSecSem(1);
    setSecStudentCount(60);
    setSecActive(true);
    setEditingItem(null);
    setModalType("create-section");
  };

  const openEditSection = (s: Section) => {
    setEditingItem(s);
    setSecName(s.name);
    setSecDept(s.department);
    setSecYear(s.academic_year);
    setSecSem(s.semester);
    setSecStudentCount(s.student_count ?? 60);
    setSecActive(s.is_active);
    setModalType("edit-section");
  };

  const openCreateAvailability = () => {
    setAvailFacultyId(faculty.length > 0 ? String(faculty[0].id) : "");
    setAvailDay("Monday");
    setAvailStartTime("09:00");
    setAvailEndTime("11:00");
    setAvailReason("Research & Lab Duties");
    setEditingItem(null);
    setModalType("create-availability");
  };

  const openCreateSubject = () => {
    setSubCode("");
    setSubName("");
    setSubDept(departmentsList[0] || "Computer Science");
    setEditingItem(null);
    setModalType("create-subject");
  };

  const openEditSubject = (s: Subject) => {
    setEditingItem(s);
    setSubCode(s.code);
    setSubName(s.name);
    setSubDept(s.department);
    setModalType("edit-subject");
  };

  const openCreateFaculty = () => {
    setFacEmpId(`FAC-${String(faculty.length + 1).padStart(2, "0")}`);
    setFacName("");
    setFacEmail("");
    setFacDept(departmentsList[0] || "Computer Science");
    setFacActive(true);
    setEditingItem(null);
    setModalType("create-faculty");
  };

  const openEditFaculty = (f: FacultyMember) => {
    setEditingItem(f);
    setFacEmpId(f.employee_id);
    setFacName(f.name);
    setFacEmail(f.email);
    setFacDept(f.department);
    setFacActive(f.is_active);
    setModalType("edit-faculty");
  };

  const openCreateMapping = () => {
    setMapFacultyId(faculty.length > 0 ? String(faculty[0].id) : "");
    setMapSubjectId(subjects.length > 0 ? String(subjects[0].id) : "");
    setEditingItem(null);
    setModalType("create-mapping");
  };

  const openCreateRoom = () => {
    setRoomName("");
    setRoomType("classroom");
    setRoomCapacity(60);
    setRoomBuilding("Academic Wing");
    setRoomActive(true);
    setEditingItem(null);
    setModalType("create-room");
  };

  const openEditRoom = (r: Room) => {
    setEditingItem(r);
    setRoomName(r.name);
    setRoomType(r.room_type === "lab" ? "lab" : "classroom");
    setRoomCapacity(r.capacity);
    setRoomBuilding(r.building || "Academic Wing");
    setRoomActive(r.is_active);
    setModalType("edit-room");
  };

  const openCreateRequirement = () => {
    setReqClassId(sections.length > 0 ? String(sections[0].id) : "");
    setReqSubjectId(subjects.length > 0 ? String(subjects[0].id) : "");
    setReqFacultyId(faculty.length > 0 ? String(faculty[0].id) : "");
    setReqWeeklyPeriods(4);
    setReqLab(false);
    setEditingItem(null);
    setModalType("create-requirement");
  };

  const openEditRequirement = (o: CourseOffering) => {
    setEditingItem(o);
    setReqClassId(String(o.class_id));
    setReqSubjectId(String(o.subject_id));
    setReqFacultyId(String(o.faculty_id));
    setReqWeeklyPeriods(o.weekly_periods);
    setReqLab(o.requires_lab);
    setModalType("edit-requirement");
  };

  // Form Submissions
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (modalType === "create-section") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: secName,
            department: secDept,
            academic_year: Number(secYear),
            semester: Number(secSem),
            student_count: Number(secStudentCount),
            is_active: secActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create section");
        setNotice(`Class section '${secName}' created successfully.`);
      } else if (modalType === "edit-section" && editingItem) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/sections/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: secName,
            department: secDept,
            academic_year: Number(secYear),
            semester: Number(secSem),
            student_count: Number(secStudentCount),
            is_active: secActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update section");
        setNotice(`Class section '${secName}' updated successfully.`);
      } else if (modalType === "create-subject") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/subjects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: subCode,
            name: subName,
            department: subDept,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create subject");
        setNotice(`Subject '${subCode}: ${subName}' created successfully.`);
      } else if (modalType === "edit-subject" && editingItem) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/subjects/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: subCode,
            name: subName,
            department: subDept,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update subject");
        setNotice(`Subject '${subCode}' updated successfully.`);
      } else if (modalType === "create-faculty") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/faculty`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: facEmpId,
            name: facName,
            email: facEmail,
            department: facDept,
            is_active: facActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create faculty member");
        setNotice(`Faculty '${facName}' (${facEmpId}) created successfully.`);
      } else if (modalType === "edit-faculty" && editingItem) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/faculty/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: facEmpId,
            name: facName,
            email: facEmail,
            department: facDept,
            is_active: facActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update faculty member");
        setNotice(`Faculty member '${facName}' updated successfully.`);
      } else if (modalType === "create-mapping") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/faculty-subjects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            faculty_id: Number(mapFacultyId),
            subject_id: Number(mapSubjectId),
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to map faculty to subject");
        setNotice("Faculty-subject qualification mapping saved.");
      } else if (modalType === "create-room") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/rooms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: roomName,
            room_type: roomType,
            capacity: Number(roomCapacity),
            building: roomBuilding,
            is_active: roomActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create room");
        setNotice(`Room '${roomName}' created successfully.`);
      } else if (modalType === "edit-room" && editingItem) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/rooms/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: roomName,
            room_type: roomType,
            capacity: Number(roomCapacity),
            building: roomBuilding,
            is_active: roomActive,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update room");
        setNotice(`Room '${roomName}' updated successfully.`);
      } else if (modalType === "create-requirement") {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/course-offerings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_id: Number(reqClassId),
            subject_id: Number(reqSubjectId),
            faculty_id: Number(reqFacultyId),
            weekly_periods: Number(reqWeeklyPeriods),
            requires_lab: reqLab,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create course requirement");
        setNotice("Course requirement assigned successfully.");
      } else if (modalType === "edit-requirement" && editingItem) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/course-offerings/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_id: Number(reqClassId),
            subject_id: Number(reqSubjectId),
            faculty_id: Number(reqFacultyId),
            weekly_periods: Number(reqWeeklyPeriods),
            requires_lab: reqLab,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to update course requirement");
        setNotice("Course requirement updated successfully.");
      } else if (modalType === "create-availability") {
        if (!availFacultyId) throw new Error("Please select a faculty member.");
        const res = await fetchWithAuth(`${API_BASE_URL}/api/faculty-availability`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            faculty_id: Number(availFacultyId),
            day: availDay,
            start_time: availStartTime,
            end_time: availEndTime,
            is_available: false,
            reason: availReason,
          }),
        }, getToken);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to add faculty blackout restriction");
        setNotice("Faculty blackout period recorded successfully.");
      }

      setModalType(null);
      void refreshAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Action with Cascade Safety
  const executeDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    setError("");
    setNotice("");

    const { entity, id, name } = deleteTarget;
    let endpoint = "";

    if (entity === "section") endpoint = `${API_BASE_URL}/api/sections/${id}`;
    else if (entity === "subject") endpoint = `${API_BASE_URL}/api/subjects/${id}`;
    else if (entity === "faculty") endpoint = `${API_BASE_URL}/api/faculty/${id}`;
    else if (entity === "mapping") endpoint = `${API_BASE_URL}/api/faculty-subjects/${id}`;
    else if (entity === "room") endpoint = `${API_BASE_URL}/api/rooms/${id}`;
    else if (entity === "requirement") endpoint = `${API_BASE_URL}/api/course-offerings/${id}`;
    else if (entity === "availability") endpoint = `${API_BASE_URL}/api/faculty-availability/${id}`;

    try {
      const res = await fetchWithAuth(endpoint, { method: "DELETE" }, getToken);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Failed to delete ${entity}`);
      }
      setNotice(`Deleted ${entity} '${name}' successfully.`);
      setDeleteTarget(null);
      void refreshAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete request rejected");
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Preview & Validation
  const handleValidateCsv = async () => {
    if (!csvContent.trim()) {
      setError("Please paste or upload CSV content before validating.");
      return;
    }

    setCsvValidating(true);
    setError("");
    setNotice("");

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/import/csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: csvEntity,
          csv_content: csvContent,
          preview_only: true,
        }),
      }, getToken);

      const data: CsvImportPreviewResult = await res.json();
      if (!res.ok) {
        throw new Error((data as unknown as { detail?: string }).detail || "CSV validation failed");
      }
      setCsvPreview(data);
      if (data.can_import) {
        setNotice(`CSV preview verified: all ${data.valid_count} rows are valid and ready to import.`);
      } else {
        setError(`CSV validation identified ${data.invalid_count} issue(s). Review row errors below.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV processing failed");
    } finally {
      setCsvValidating(false);
    }
  };

  // CSV Commit Import
  const handleCommitCsv = async () => {
    if (!csvPreview || !csvPreview.can_import) {
      setError("Resolve all invalid rows before importing.");
      return;
    }

    setCsvImporting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/import/csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: csvEntity,
          csv_content: csvContent,
          preview_only: false,
        }),
      }, getToken);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to commit CSV records");
      }

      setNotice(data.message || `Imported ${data.imported_count} records into database.`);
      setCsvContent("");
      setCsvPreview(null);
      void refreshAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV commit failed");
    } finally {
      setCsvImporting(false);
    }
  };

  // Explicit Demo Data Loader
  const handleLoadDemoData = async () => {
    if (!confirm("Load Sample Dataset into the database? This will safely populate standard classes, subjects, faculty, rooms, and requirements.")) {
      return;
    }
    setLoadingDemoData(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/academic-data/load-demo-data`, {
        method: "POST",
      }, getToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to load demo data");
      setNotice("Sample dataset loaded successfully. All academic entities are synchronized.");
      void refreshAllData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample dataset");
    } finally {
      setLoadingDemoData(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview & Readiness Banner */}
      {overview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    overview.ready_for_scheduling
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      overview.ready_for_scheduling ? "bg-emerald-500" : "bg-amber-500"
                    )}
                  />
                  {overview.ready_for_scheduling
                    ? "Ready for Timetable Generation"
                    : "Missing Academic Data"}
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">
                  {overview.ready_for_scheduling
                    ? "Sufficient sections, faculty, rooms, and requirements are active."
                    : overview.readiness_details[0]}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                Academic Data Management Portal
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleLoadDemoData}
                disabled={loadingDemoData}
                title="Populate standard university demo records from Sample_Dataset"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Sparkles className={cn("h-3.5 w-3.5 text-amber-500", loadingDemoData && "animate-spin")} />
                <span>{loadingDemoData ? "Loading..." : "Load Demo Data"}</span>
              </button>

              <button
                onClick={() => setSubTab("csv")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Bulk CSV Import</span>
              </button>

              {onNavigateToSettings && (
                <button
                  onClick={onNavigateToSettings}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Sliders className="h-3.5 w-3.5 text-slate-500" />
                  <span>Timing Grid Settings</span>
                </button>
              )}

              {onNavigateToTimetable && (
                <button
                  onClick={onNavigateToTimetable}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
                >
                  <span>Go to Timetable Workspace</span>
                </button>
              )}
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div
              onClick={() => setSubTab("sections")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "sections" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Sections</span>
                <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.sections_count}</p>
              <p className="text-[10px] text-slate-400">{overview.active_sections_count} active</p>
            </div>

            <div
              onClick={() => setSubTab("subjects")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "subjects" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Subjects</span>
                <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.subjects_count}</p>
              <p className="text-[10px] text-slate-400">Curriculum units</p>
            </div>

            <div
              onClick={() => setSubTab("faculty")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "faculty" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Faculty</span>
                <Users className="h-3.5 w-3.5 text-emerald-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.faculty_count}</p>
              <p className="text-[10px] text-slate-400">{overview.active_faculty_count} active</p>
            </div>

            <div
              onClick={() => setSubTab("mappings")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "mappings" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Qualifications</span>
                <Link2 className="h-3.5 w-3.5 text-teal-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.qualifications_count}</p>
              <p className="text-[10px] text-slate-400">Faculty-subject pairs</p>
            </div>

            <div
              onClick={() => setSubTab("rooms")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "rooms" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Rooms</span>
                <Building className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.rooms_count}</p>
              <p className="text-[10px] text-slate-400">
                {overview.classrooms_count} cr · {overview.labs_count} labs
              </p>
            </div>

            <div
              onClick={() => setSubTab("requirements")}
              className={cn(
                "cursor-pointer rounded-xl border p-3 transition hover:border-slate-400",
                subTab === "requirements" ? "border-slate-900 bg-slate-50/50" : "border-slate-200 bg-slate-50/30"
              )}
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-[11px] font-medium">Requirements</span>
                <Layers className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{overview.offerings_count}</p>
              <p className="text-[10px] text-slate-400">Course offerings</p>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </span>
          <button onClick={() => setNotice("")} className="text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
            <span>{error}</span>
          </span>
          <button onClick={() => setError("")} className="text-rose-700 hover:text-rose-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs and Actions Bar */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSubTab("sections")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "sections" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <GraduationCap className="h-3.5 w-3.5" />
            <span>Classes / Sections ({sections.length})</span>
          </button>

          <button
            onClick={() => setSubTab("subjects")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "subjects" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Subjects ({subjects.length})</span>
          </button>

          <button
            onClick={() => setSubTab("faculty")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "faculty" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Faculty ({faculty.length})</span>
          </button>

          <button
            onClick={() => setSubTab("availability")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "availability" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Faculty Availability ({availabilities.length})</span>
          </button>

          <button
            onClick={() => setSubTab("mappings")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "mappings" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Faculty-Subject Mappings ({mappings.length})</span>
          </button>

          <button
            onClick={() => setSubTab("rooms")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "rooms" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Building className="h-3.5 w-3.5" />
            <span>Rooms ({rooms.length})</span>
          </button>

          <button
            onClick={() => setSubTab("requirements")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "requirements" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Course Requirements ({offerings.length})</span>
          </button>

          <button
            onClick={() => setSubTab("csv")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              subTab === "csv" ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            )}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Bulk CSV Import</span>
          </button>
        </div>

        {subTab !== "csv" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${subTab}...`}
                className="h-8 w-36 rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 sm:w-44"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {(subTab === "sections" || subTab === "subjects" || subTab === "faculty") && (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-slate-900"
              >
                <option value="all">All Departments</option>
                {departmentsList.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}

            {subTab === "sections" && (
              <button
                onClick={openCreateSection}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Class Section</span>
              </button>
            )}

            {subTab === "subjects" && (
              <button
                onClick={openCreateSubject}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Subject</span>
              </button>
            )}

            {subTab === "faculty" && (
              <button
                onClick={openCreateFaculty}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Faculty</span>
              </button>
            )}

            {subTab === "availability" && (
              <button
                onClick={openCreateAvailability}
                disabled={faculty.length === 0}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Blackout Window</span>
              </button>
            )}

            {subTab === "mappings" && (
              <button
                onClick={openCreateMapping}
                disabled={faculty.length === 0 || subjects.length === 0}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Map Faculty to Subject</span>
              </button>
            )}

            {subTab === "rooms" && (
              <button
                onClick={openCreateRoom}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Room</span>
              </button>
            )}

            {subTab === "requirements" && (
              <button
                onClick={openCreateRequirement}
                disabled={sections.length === 0 || subjects.length === 0 || faculty.length === 0}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Requirement</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin text-slate-700" />
            <span>Synchronizing academic database records...</span>
          </div>
        </div>
      )}

      {/* -------------------- 1. Sections View -------------------- */}
      {!loading && subTab === "sections" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredSections.length === 0 ? (
            <div className="p-8 text-center">
              <GraduationCap className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No class sections found</p>
              <p className="text-xs text-slate-500">Add sections manually or upload via Bulk CSV Import.</p>
              <button
                onClick={openCreateSection}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add First Section
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Section Name / Class ID</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Academic Year / Semester</th>
                  <th className="px-5 py-3">Student Count</th>
                  <th className="px-5 py-3">Requirements</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSections.map((sec) => (
                  <tr key={sec.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">{sec.name}</td>
                    <td className="px-5 py-3 text-slate-600">{sec.department}</td>
                    <td className="px-5 py-3 text-slate-600">
                      Year {sec.academic_year} · Semester {sec.semester}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                        {sec.student_count ?? 60} students
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {sec.offerings_count ?? 0} courses
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          sec.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", sec.is_active ? "bg-emerald-500" : "bg-slate-400")} />
                        {sec.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditSection(sec)}
                          title="Edit Section"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ entity: "section", id: sec.id, name: sec.name })}
                          title="Delete Section"
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 2. Subjects View -------------------- */}
      {!loading && subTab === "subjects" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredSubjects.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No subjects found</p>
              <p className="text-xs text-slate-500">Define course curriculum units or import from CSV.</p>
              <button
                onClick={openCreateSubject}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add First Subject
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Subject Code</th>
                  <th className="px-5 py-3">Subject Name</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Qualified Faculty</th>
                  <th className="px-5 py-3">Requirements</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubjects.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">{sub.code}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{sub.name}</td>
                    <td className="px-5 py-3 text-slate-600">{sub.department}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                        {sub.qualifications_count ?? 0} faculty
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {sub.offerings_count ?? 0} assigned
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditSubject(sub)}
                          title="Edit Subject"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ entity: "subject", id: sub.id, name: `${sub.code}: ${sub.name}` })}
                          title="Delete Subject"
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 3. Faculty View -------------------- */}
      {!loading && subTab === "faculty" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredFaculty.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No faculty members found</p>
              <p className="text-xs text-slate-500">Register instructors and professors to teach courses.</p>
              <button
                onClick={openCreateFaculty}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add Faculty Member
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Faculty ID</th>
                  <th className="px-5 py-3">Faculty Name</th>
                  <th className="px-5 py-3">Email Address</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Workload</th>
                  <th className="px-5 py-3">Qualified Subjects</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFaculty.map((fac) => (
                  <tr key={fac.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-mono font-semibold text-slate-900">{fac.employee_id}</td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{fac.name}</td>
                    <td className="px-5 py-3 text-slate-600">{fac.email}</td>
                    <td className="px-5 py-3 text-slate-600">{fac.department}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      {fac.weekly_workload} periods/wk
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {fac.qualifications.length === 0 ? (
                          <span className="text-[10px] text-slate-400 italic">No subjects mapped</span>
                        ) : (
                          fac.qualifications.map((q) => (
                            <span
                              key={q.subject_id}
                              className="rounded-xs bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                            >
                              {q.code}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          fac.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", fac.is_active ? "bg-emerald-500" : "bg-slate-400")} />
                        {fac.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditFaculty(fac)}
                          title="Edit Faculty"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ entity: "faculty", id: fac.id, name: fac.name })}
                          title="Delete Faculty"
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- Faculty Availability View -------------------- */}
      {!loading && subTab === "availability" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredAvailabilities.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No blackout / unavailable periods configured</p>
              <p className="text-xs text-slate-500">
                All faculty members are currently available across all active timetabling periods.
              </p>
              <button
                onClick={openCreateAvailability}
                disabled={faculty.length === 0}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add Blackout Window
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Faculty Member</th>
                  <th className="px-5 py-3">Employee ID</th>
                  <th className="px-5 py-3">Day of Week</th>
                  <th className="px-5 py-3">Unavailable Time Window</th>
                  <th className="px-5 py-3">Reason / Justification</th>
                  <th className="px-5 py-3">CP-SAT Constraint Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAvailabilities.map((avail) => (
                  <tr key={avail.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">
                      {avail.faculty_name || `Faculty #${avail.faculty_id}`}
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-mono text-[11px]">
                      {avail.employee_id || "—"}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">{avail.day}</td>
                    <td className="px-5 py-3 font-semibold text-rose-700">
                      {avail.start_time} – {avail.end_time}
                    </td>
                    <td className="px-5 py-3 text-slate-600 italic">
                      {avail.reason || "General Unavailability"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Hard Blackout (0 Lessons)
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            entity: "availability",
                            id: avail.id,
                            name: `${avail.faculty_name || "Faculty"} on ${avail.day} (${avail.start_time}-${avail.end_time})`,
                          })
                        }
                        title="Remove Blackout Restriction"
                        className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 4. Faculty-Subject Mappings View -------------------- */}
      {!loading && subTab === "mappings" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredMappings.length === 0 ? (
            <div className="p-8 text-center">
              <Link2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No faculty-subject qualifications mapped</p>
              <p className="text-xs text-slate-500">
                Assign subjects to faculty members to validate teaching eligibility.
              </p>
              <button
                onClick={openCreateMapping}
                disabled={faculty.length === 0 || subjects.length === 0}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Map Faculty to Subject
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Faculty Member</th>
                  <th className="px-5 py-3">Faculty ID</th>
                  <th className="px-5 py-3">Qualified Subject</th>
                  <th className="px-5 py-3">Subject Code</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMappings.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">{m.faculty_name}</td>
                    <td className="px-5 py-3 font-mono text-slate-600">{m.employee_id}</td>
                    <td className="px-5 py-3 text-slate-800">{m.subject_name}</td>
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">{m.subject_code}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            entity: "mapping",
                            id: m.id,
                            name: `${m.faculty_name} -> ${m.subject_code}`,
                          })
                        }
                        title="Remove Mapping"
                        className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 5. Rooms View -------------------- */}
      {!loading && subTab === "rooms" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredRooms.length === 0 ? (
            <div className="p-8 text-center">
              <Building className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No rooms found</p>
              <p className="text-xs text-slate-500">Add classrooms and labs to hold teaching sessions.</p>
              <button
                onClick={openCreateRoom}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add Room
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Room Number / Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Capacity</th>
                  <th className="px-5 py-3">Building</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRooms.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">{r.name}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                          r.room_type === "lab"
                            ? "bg-purple-50 text-purple-800 border border-purple-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        )}
                      >
                        {r.room_type === "lab" ? "Laboratory" : "Classroom"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{r.capacity} seats</td>
                    <td className="px-5 py-3 text-slate-600">{r.building || "—"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          r.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", r.is_active ? "bg-emerald-500" : "bg-slate-400")} />
                        {r.is_active ? "Available" : "Maintenance"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditRoom(r)}
                          title="Edit Room"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ entity: "room", id: r.id, name: r.name })}
                          title="Delete Room"
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 6. Course Requirements View -------------------- */}
      {!loading && subTab === "requirements" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {filteredOfferings.length === 0 ? (
            <div className="p-8 text-center">
              <Layers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No course requirements defined</p>
              <p className="text-xs text-slate-500">
                Assign subjects, faculty, and weekly session requirements to sections.
              </p>
              <button
                onClick={openCreateRequirement}
                disabled={sections.length === 0 || subjects.length === 0 || faculty.length === 0}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Define First Course Requirement
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Section</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Assigned Faculty</th>
                  <th className="px-5 py-3">Weekly Periods</th>
                  <th className="px-5 py-3">Room Required</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOfferings.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-900">{o.class_name}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono font-bold text-slate-900">{o.subject_code}</span>:{" "}
                      <span className="text-slate-700">{o.subject_name}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{o.faculty_name}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      {o.weekly_periods} periods/wk
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          o.requires_lab
                            ? "bg-purple-50 text-purple-800 border border-purple-200"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {o.requires_lab ? "Laboratory Required" : "Standard Classroom"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEditRequirement(o)}
                          title="Edit Requirement"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            setDeleteTarget({
                              entity: "requirement",
                              id: o.id,
                              name: `${o.class_name} · ${o.subject_code}`,
                            })
                          }
                          title="Delete Requirement"
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* -------------------- 7. Bulk CSV Import View -------------------- */}
      {subTab === "csv" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Bulk Academic CSV Importer</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Upload or paste CSV datasets. Supports both official university templates and Sample_Dataset formats.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Target Entity:</label>
                <select
                  value={csvEntity}
                  onChange={(e) => {
                    setCsvEntity(
                      e.target.value as "sections" | "subjects" | "faculty" | "faculty_subjects" | "rooms" | "requirements"
                    );
                    setCsvPreview(null);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-xs outline-none focus:border-slate-900"
                >
                  <option value="sections">Classes / Sections</option>
                  <option value="subjects">Subjects / Courses</option>
                  <option value="faculty">Faculty Registry</option>
                  <option value="faculty_subjects">Faculty-Subject Mappings</option>
                  <option value="rooms">Rooms & Laboratories</option>
                  <option value="requirements">Course Requirements / Offerings</option>
                </select>
              </div>
            </div>

            {/* Expected Headers Help Pill */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">Supported CSV Headers: </span>
              {csvEntity === "sections" && (
                <code>class_id, programme, semester, section, student_count (or name, department, academic_year, semester)</code>
              )}
              {csvEntity === "subjects" && (
                <code>subject_id, subject_name, subject_type, periods_per_week, duration_periods, required_room_type (or code, name, department)</code>
              )}
              {csvEntity === "faculty" && (
                <code>faculty_id, faculty_name, max_periods_per_week, max_periods_per_day (or employee_id, name, email, department)</code>
              )}
              {csvEntity === "faculty_subjects" && (
                <code>faculty_id, subject_id (references employee_id and subject_code or database IDs)</code>
              )}
              {csvEntity === "rooms" && (
                <code>room_id, room_name, room_type, capacity (or name, room_type, capacity, building)</code>
              )}
              {csvEntity === "requirements" && (
                <code>class_id, subject_id, faculty_id, sessions_per_week, duration_periods (or class_id, subject_id, faculty_id, weekly_periods, requires_lab)</code>
              )}
            </div>

            {/* File Upload & Text Area */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Paste CSV Text or Upload File</label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50">
                  <Upload className="h-3 w-3 text-slate-500" />
                  <span>Choose CSV File</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        setCsvContent(content || "");
                        setCsvPreview(null);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>
              </div>

              <textarea
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setCsvPreview(null);
                }}
                rows={7}
                placeholder="Paste CSV rows here..."
                className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs text-slate-900 outline-none focus:border-slate-900"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-500">
                  {csvContent.trim() ? `${csvContent.trim().split("\n").length} row(s) entered` : "No CSV text entered yet"}
                </span>

                <div className="flex items-center gap-2">
                  {csvPreview && (
                    <button
                      onClick={() => setCsvPreview(null)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Clear Preview
                    </button>
                  )}

                  <button
                    onClick={handleValidateCsv}
                    disabled={csvValidating || !csvContent.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", csvValidating && "animate-spin")} />
                    <span>{csvValidating ? "Validating Rows..." : "Validate & Preview"}</span>
                  </button>

                  <button
                    onClick={handleCommitCsv}
                    disabled={csvImporting || !csvPreview || !csvPreview.can_import}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{csvImporting ? "Importing to Database..." : "Commit Import"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CSV Preview Section */}
          {csvPreview && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">CSV Import Validation Summary</h4>
                  <p className="text-xs text-slate-500">{csvPreview.summary}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold",
                    csvPreview.can_import ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  )}
                >
                  {csvPreview.can_import ? "Ready to Commit" : "Validation Errors Identified"}
                </span>
              </div>

              {/* Invalid Rows Table */}
              {csvPreview.invalid_rows.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-rose-200 bg-rose-50/50">
                  <div className="border-b border-rose-200 bg-rose-100/70 px-4 py-2 text-xs font-bold text-rose-900">
                    Row-Level Errors ({csvPreview.invalid_rows.length} row(s) failed validation)
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-rose-50 text-[10px] font-bold uppercase text-rose-800">
                      <tr>
                        <th className="px-4 py-2">Row #</th>
                        <th className="px-4 py-2">Row Data</th>
                        <th className="px-4 py-2">Validation Failure Cause</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {csvPreview.invalid_rows.map((inv) => (
                        <tr key={inv.row} className="bg-white/80">
                          <td className="px-4 py-2 font-mono font-semibold text-rose-900">Row {inv.row}</td>
                          <td className="px-4 py-2 font-mono text-[11px] text-slate-600">
                            {JSON.stringify(inv.data)}
                          </td>
                          <td className="px-4 py-2">
                            {inv.errors.map((err, i) => (
                              <p key={i} className="text-[11px] font-medium text-rose-700">
                                • {err}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Valid Rows Preview Table */}
              {csvPreview.valid_rows.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/30">
                  <div className="border-b border-emerald-200 bg-emerald-100/60 px-4 py-2 text-xs font-bold text-emerald-900">
                    Valid Rows ({csvPreview.valid_rows.length} row(s) verified for database insertion)
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-emerald-50 text-[10px] font-bold uppercase text-emerald-800">
                      <tr>
                        <th className="px-4 py-2">Row #</th>
                        <th className="px-4 py-2">Sanitized Model Parameters</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {csvPreview.valid_rows.slice(0, 15).map((vr) => (
                        <tr key={vr.row} className="bg-white/90">
                          <td className="px-4 py-2 font-mono font-semibold text-emerald-900">Row {vr.row}</td>
                          <td className="px-4 py-2 font-mono text-[11px] text-slate-700">
                            {JSON.stringify(vr.model_data)}
                          </td>
                          <td className="px-4 py-2 font-semibold text-emerald-700">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Valid
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvPreview.valid_rows.length > 15 && (
                    <div className="bg-white/80 p-2 text-center text-[10px] text-slate-400">
                      Showing first 15 of {csvPreview.valid_rows.length} valid rows
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -------------------- Create / Edit Modal Dialogs -------------------- */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {modalType.startsWith("create") ? "Add New " : "Edit "}
                {modalType.includes("section")
                  ? "Class Section"
                  : modalType.includes("subject")
                  ? "Subject"
                  : modalType.includes("availability")
                  ? "Faculty Availability Restriction"
                  : modalType.includes("faculty")
                  ? "Faculty Member"
                  : modalType.includes("mapping")
                  ? "Faculty-Subject Qualification"
                  : modalType.includes("room")
                  ? "Room"
                  : "Course Requirement"}
              </h3>
              <button
                onClick={() => setModalType(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Sections Form */}
              {(modalType === "create-section" || modalType === "edit-section") && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Section Name / Class ID</label>
                    <input
                      required
                      value={secName}
                      onChange={(e) => setSecName(e.target.value)}
                      placeholder="e.g. CS-Sec-A or CSE301"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Department</label>
                    <input
                      required
                      value={secDept}
                      onChange={(e) => setSecDept(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Academic Year (1–4)</label>
                      <input
                        type="number"
                        min={1}
                        max={4}
                        required
                        value={secYear}
                        onChange={(e) => setSecYear(Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Semester (1–8)</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        required
                        value={secSem}
                        onChange={(e) => setSecSem(Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Student Count</label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        required
                        value={secStudentCount}
                        onChange={(e) => setSecStudentCount(Number(e.target.value))}
                        placeholder="e.g. 60"
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="secActive"
                      checked={secActive}
                      onChange={(e) => setSecActive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <label htmlFor="secActive" className="text-xs font-medium text-slate-700">
                      Active (available for timetable generation)
                    </label>
                  </div>
                </>
              )}

              {/* Subjects Form */}
              {(modalType === "create-subject" || modalType === "edit-subject") && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Subject Code</label>
                    <input
                      required
                      value={subCode}
                      onChange={(e) => setSubCode(e.target.value.toUpperCase())}
                      placeholder="e.g. CS101 or CS104L"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 font-mono text-xs uppercase outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Subject Name</label>
                    <input
                      required
                      value={subName}
                      onChange={(e) => setSubName(e.target.value)}
                      placeholder="e.g. Programming Fundamentals"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Department</label>
                    <input
                      required
                      value={subDept}
                      onChange={(e) => setSubDept(e.target.value)}
                      placeholder="e.g. Computer Science"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                </>
              )}

              {/* Faculty Form */}
              {(modalType === "create-faculty" || modalType === "edit-faculty") && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Faculty ID / Employee ID</label>
                    <input
                      required
                      value={facEmpId}
                      onChange={(e) => setFacEmpId(e.target.value)}
                      placeholder="e.g. FAC-01"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 font-mono text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Faculty Full Name</label>
                    <input
                      required
                      value={facName}
                      onChange={(e) => setFacName(e.target.value)}
                      placeholder="e.g. Dr. Alice Smith"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Official Email</label>
                    <input
                      type="email"
                      required
                      value={facEmail}
                      onChange={(e) => setFacEmail(e.target.value)}
                      placeholder="e.g. alice@optisched.edu"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Department</label>
                    <input
                      required
                      value={facDept}
                      onChange={(e) => setFacDept(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="facActive"
                      checked={facActive}
                      onChange={(e) => setFacActive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <label htmlFor="facActive" className="text-xs font-medium text-slate-700">
                      Active (available for teaching assignments)
                    </label>
                  </div>
                </>
              )}

              {/* Mapping Form */}
              {modalType === "create-mapping" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Faculty Member</label>
                    <select
                      required
                      value={mapFacultyId}
                      onChange={(e) => setMapFacultyId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.employee_id}) — {f.department}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Qualified Subject</label>
                    <select
                      required
                      value={mapSubjectId}
                      onChange={(e) => setMapSubjectId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code}: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Rooms Form */}
              {(modalType === "create-room" || modalType === "edit-room") && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Room Number / Name</label>
                    <input
                      required
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="e.g. CR-101 or Lab-201"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Room Type</label>
                      <select
                        value={roomType}
                        onChange={(e) => setRoomType(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      >
                        <option value="classroom">Classroom / Lecture</option>
                        <option value="lab">Laboratory</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Capacity (Seats)</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={roomCapacity}
                        onChange={(e) => setRoomCapacity(Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Building / Location</label>
                    <input
                      value={roomBuilding}
                      onChange={(e) => setRoomBuilding(e.target.value)}
                      placeholder="e.g. Main Block"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="roomActive"
                      checked={roomActive}
                      onChange={(e) => setRoomActive(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <label htmlFor="roomActive" className="text-xs font-medium text-slate-700">
                      Available for scheduling
                    </label>
                  </div>
                </>
              )}

              {/* Course Requirements Form */}
              {(modalType === "create-requirement" || modalType === "edit-requirement") && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Target Class Section</label>
                    <select
                      required
                      value={reqClassId}
                      onChange={(e) => setReqClassId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Semester {s.semester})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Subject</label>
                    <select
                      required
                      value={reqSubjectId}
                      onChange={(e) => {
                        setReqSubjectId(e.target.value);
                        // Auto-toggle lab flag if subject code ends with L or has lab in name
                        const selectedSub = subjects.find((s) => String(s.id) === e.target.value);
                        if (selectedSub) {
                          const isLab = selectedSub.code.endsWith("L") || selectedSub.name.toLowerCase().includes("lab");
                          setReqLab(isLab);
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code}: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Assigned Faculty Member</label>
                    <select
                      required
                      value={reqFacultyId}
                      onChange={(e) => setReqFacultyId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Weekly Teaching Periods</label>
                      <input
                        type="number"
                        min={1}
                        max={35}
                        required
                        value={reqWeeklyPeriods}
                        onChange={(e) => setReqWeeklyPeriods(Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>

                    <div className="flex flex-col justify-end pb-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={reqLab}
                          onChange={(e) => setReqLab(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        />
                        <span>Requires Laboratory</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Faculty Availability Form */}
              {modalType === "create-availability" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Faculty Member</label>
                    <select
                      required
                      value={availFacultyId}
                      onChange={(e) => setAvailFacultyId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.employee_id}) — {f.department}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Day of Week</label>
                    <select
                      value={availDay}
                      onChange={(e) => setAvailDay(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Start Time (HH:MM)</label>
                      <input
                        type="time"
                        required
                        value={availStartTime}
                        onChange={(e) => setAvailStartTime(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">End Time (HH:MM)</label>
                      <input
                        type="time"
                        required
                        value={availEndTime}
                        onChange={(e) => setAvailEndTime(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Reason / Duty Description</label>
                    <input
                      required
                      value={availReason}
                      onChange={(e) => setAvailReason(e.target.value)}
                      placeholder="e.g. Research duties, Dept Meeting, Sabbatical"
                      className="mt-1 w-full rounded-md border border-slate-200 p-2 text-xs outline-none focus:border-slate-900"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      The CP-SAT timetable solver will enforce 0 assignments for this faculty member during this blackout period.
                    </p>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- Delete Confirmation Dialog -------------------- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="rounded-full bg-rose-50 p-2">
                <ShieldAlert className="h-5 w-5 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Confirm Deletion</h3>
            </div>

            <p className="mt-3 text-xs text-slate-600">
              Are you sure you want to delete {deleteTarget.entity}{" "}
              <span className="font-semibold text-slate-900">&apos;{deleteTarget.name}&apos;</span>?
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              Accidental deletions referenced by course requirements will be automatically blocked by cascade integrity safeguards.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDelete}
                disabled={submitting}
                className="rounded-md bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
