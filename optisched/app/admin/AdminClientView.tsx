"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Search,
  ShieldAlert,
  WandSparkles,
  X,
  Share2,
  AlertTriangle,
  Building,
  Users,
  GraduationCap,
  History,
  Eye,
  Activity,
  Trash2,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { AcademicDataManagement } from "@/components/AcademicDataManagement";
import { TimetableSettings } from "@/components/TimetableSettings";
import { TimetableGrid } from "@/components/TimetableGrid";
import {
  API_BASE_URL,
  fetchWithAuth,
  toUiEntry,
  fetchUsers,
  createUser,
  deleteUser,
  fetchSystemStatus,
  validatePassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/api";
import {
  Section,
  GenerateResponse,
  ValidationReport,
  ScheduleEntry,
  Room,
  FacultyMember,
  PublishedTimetable,
  ApiScheduleEntry,
  User,
  SystemStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { useFormDraft } from "@/lib/useFormDraft";

export default function AdminClientView({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const { getToken, userId } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "academic-data" | "faculty" | "curriculum" | "settings" | "users" | "system"
  >("dashboard");

  // User Management State
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState<string | null>(null);
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState<string | null>(null);
  const [newUserRole, setNewUserRole] = useState<("admin" | "faculty" | "student") | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userActionNotice, setUserActionNotice] = useState("");
  const [userActionError, setUserActionError] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Form Draft Persistence (Google Chrome Modern Web Guidance)
  const {
    draft: userDraft,
    hasRestoredDraft: hasRestoredUserDraft,
    saveDraft: saveUserDraft,
    clearDraft: clearUserDraft,
  } = useFormDraft<{ name: string; email: string; role: "admin" | "faculty" | "student" }>({
    formId: "admin_create_user",
    userId,
    initialValues: {
      name: "",
      email: "",
      role: "student",
    },
  });

  const activeUserName = newUserName !== null ? newUserName : (userDraft?.name ?? "");
  const activeUserEmail = newUserEmail !== null ? newUserEmail : (userDraft?.email ?? "");
  const activeUserRole = newUserRole !== null ? newUserRole : (userDraft?.role ?? "student");

  // System Monitoring State
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loadingSystemStatus, setLoadingSystemStatus] = useState(false);

  // View Mode: Section / Faculty / Room
  const [viewMode, setViewMode] = useState<"section" | "faculty" | "room">("section");

  // Academic Entities
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");

  const [settingsSemester, setSettingsSemester] = useState<number>(1);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [rawSchedule, setRawSchedule] = useState<ApiScheduleEntry[]>([]);
  const [roomSchedule, setRoomSchedule] = useState<ScheduleEntry[]>([]);
  const [selectedRoomMeta, setSelectedRoomMeta] = useState<{
    room_name: string;
    room_type: string;
    capacity: number;
    building?: string;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingRoomSchedule, setLoadingRoomSchedule] = useState(false);

  // Timetable solver and config states
  const [solverStatus, setSolverStatus] = useState<"optimal" | "feasible" | null>(null);
  const [solveTimeSeconds, setSolveTimeSeconds] = useState<number | null>(null);
  const [workingHours, setWorkingHours] = useState("09:00-16:00");
  const [configStatus, setConfigStatus] = useState<"saved" | "fallback" | "custom_request" | "mixed" | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [semesterConfigsMap, setSemesterConfigsMap] = useState<
    Record<number, { working_hours: string; configured: boolean }>
  >({});
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);

  // Published timetables history state
  const [publishedTimetables, setPublishedTimetables] = useState<PublishedTimetable[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const historyDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = historyDialogRef.current;
    if (!dialog) return;
    if (showHistoryModal) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [showHistoryModal]);

  const refreshSections = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sections`);
      if (res.ok) {
        const data: Section[] = await res.json();
        const activeSections = data.filter((s) => s.is_active);
        setSections(activeSections);
        if (activeSections.length > 0) {
          setSelectedSectionId((prev) => {
            const exists = activeSections.some((s) => String(s.id) === prev);
            return exists ? prev : String(activeSections[0].id);
          });
        }
      }
    } catch {
      // silent
    }
  };

  const refreshConfigurationsList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/timetable/configurations`);
      if (res.ok) {
        const list: { semester: number; working_hours: string; configured: boolean }[] =
          await res.json();
        const cfgMap: Record<number, { working_hours: string; configured: boolean }> = {};
        for (const c of list) {
          cfgMap[c.semester] = {
            working_hours: c.working_hours,
            configured: Boolean(c.configured),
          };
        }
        setSemesterConfigsMap(cfgMap);
      }
    } catch {
      // Background configuration refresh silently caught
    }
  };

  const refreshPublishedTimetables = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/timetable/published`, {}, getToken);
      if (res.ok) {
        const data: PublishedTimetable[] = await res.json();
        setPublishedTimetables(data);
      }
    } catch {
      // silent
    }
  };

  const loadRoomSchedule = async (roomId: string) => {
    if (!roomId) return;
    setLoadingRoomSchedule(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/rooms/${roomId}/schedule`, {}, getToken);
      if (res.ok) {
        const data = await res.json();
        const entries = (data.schedule || []).map(toUiEntry);
        setRoomSchedule(entries);
        setSelectedRoomMeta({
          room_name: data.room_name,
          room_type: data.room_type,
          capacity: data.capacity,
          building: data.building,
        });
      } else {
        setRoomSchedule([]);
      }
    } catch {
      setRoomSchedule([]);
    } finally {
      setLoadingRoomSchedule(false);
    }
  };

  const checkLatestPublishedForSection = async (sectionId: string) => {
    if (!sectionId) return;
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/timetable/published/latest?class_id=${sectionId}`,
        {},
        getToken
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.schedule && data.schedule.length > 0) {
          setSchedule(data.schedule.map(toUiEntry));
          setRawSchedule(data.schedule);
          setIsPublished(true);
          setPublishedVersion(data.version);
          setSolverStatus(data.solver_status);
          setHasGenerated(true);
        }
      }
    } catch {
      // silent
    }
  };

  const refreshUsersList = async () => {
    setLoadingUsers(true);
    setUserActionError("");
    try {
      const data = await fetchUsers();
      setUsersList(data);
    } catch (err: unknown) {
      setUserActionError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const refreshSystemStatus = async () => {
    setLoadingSystemStatus(true);
    try {
      const data = await fetchSystemStatus();
      setSystemStatus(data);
    } catch {
      // silent
    } finally {
      setLoadingSystemStatus(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionError("");
    setUserActionNotice("");

    const pwdCheck = validatePassword(newUserPassword);
    if (!pwdCheck.isValid) {
      setUserActionError(pwdCheck.error || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setCreatingUser(true);
    try {
      const created = await createUser({
        email: activeUserEmail,
        password: newUserPassword,
        name: activeUserName || undefined,
        role: activeUserRole,
      });
      setUserActionNotice(`Successfully created ${created.role} account for ${created.email}`);
      clearUserDraft();
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserRole("student");
      await refreshUsersList();
    } catch (err: unknown) {
      setUserActionError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user account '${email}'?`)) {
      return;
    }
    setUserActionError("");
    setUserActionNotice("");
    try {
      await deleteUser(userId);
      setUserActionNotice(`User '${email}' deleted successfully.`);
      await refreshUsersList();
    } catch (err: unknown) {
      setUserActionError(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [secRes, cfgRes, roomRes, facRes, pubRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/sections`),
          fetch(`${API_BASE_URL}/api/timetable/configurations`),
          fetch(`${API_BASE_URL}/api/rooms`),
          fetch(`${API_BASE_URL}/api/faculty`),
          fetchWithAuth(`${API_BASE_URL}/api/timetable/published`, {}, getToken),
        ]);

        if (!secRes.ok) throw new Error(`Could not load sections (${secRes.status})`);
        const data: Section[] = await secRes.json();
        if (!active) return;
        const activeSections = data.filter((s) => s.is_active);
        setSections(activeSections);

        if (roomRes.ok) {
          const rData: Room[] = await roomRes.json();
          const activeRooms = rData.filter((r) => r.is_active);
          setRooms(activeRooms);
          if (activeRooms.length > 0) {
            setSelectedRoomId(String(activeRooms[0].id));
          }
        }

        if (facRes.ok) {
          const fData: FacultyMember[] = await facRes.json();
          const activeFac = fData.filter((f) => f.is_active);
          setFacultyList(activeFac);
          if (activeFac.length > 0) {
            setSelectedFacultyId(String(activeFac[0].id));
          }
        }

        if (pubRes.ok) {
          const pubData: PublishedTimetable[] = await pubRes.json();
          setPublishedTimetables(pubData);
        }

        if (cfgRes.ok) {
          const cfgData: { semester: number; working_hours: string; configured: boolean }[] =
            await cfgRes.json();
          const cfgMap: Record<number, { working_hours: string; configured: boolean }> = {};
          for (const c of cfgData) {
            cfgMap[c.semester] = {
              working_hours: c.working_hours,
              configured: Boolean(c.configured),
            };
          }
          setSemesterConfigsMap(cfgMap);
        }

        if (activeSections.length > 0) {
          const initialSecId = String(activeSections[0].id);
          setSelectedSectionId(initialSecId);
          setSettingsSemester(activeSections[0].semester);
          const sem = activeSections[0].semester;
          if (semesterConfigsMap[sem]?.working_hours) {
            setWorkingHours(semesterConfigsMap[sem].working_hours);
          }
          void checkLatestPublishedForSection(initialSecId);
        }
      } catch (e) {
        if (!active) return;
        setError(
          e instanceof Error
            ? e.message
            : "Failed to connect to OptiSched backend services."
        );
      } finally {
        if (active) setLoadingSections(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, []);

  const selectedSection = sections.find((s) => String(s.id) === selectedSectionId);
  const selectedRoom = rooms.find((r) => String(r.id) === selectedRoomId);
  const selectedFaculty = facultyList.find((f) => String(f.id) === selectedFacultyId);

  // Filtered schedules for search
  const filteredSchedule = useMemo(() => {
    if (!search.trim()) return schedule;
    const q = search.toLowerCase();
    return schedule.filter((entry) => {
      const matchText =
        `${entry.subject} ${entry.subjectCode} ${entry.faculty} ${entry.room}`.toLowerCase();
      return matchText.includes(q);
    });
  }, [schedule, search]);

  const facultyFilteredSchedule = useMemo(() => {
    if (!selectedFaculty) return [];
    const q = search.trim().toLowerCase();
    const targetName = selectedFaculty.name.toLowerCase();
    return schedule.filter((entry) => {
      const isMine =
        entry.faculty.toLowerCase().includes(targetName) ||
        targetName.includes(entry.faculty.toLowerCase());
      if (!isMine) return false;
      if (!q) return true;
      const matchText =
        `${entry.subject} ${entry.subjectCode} ${entry.faculty} ${entry.room} ${entry.className}`.toLowerCase();
      return matchText.includes(q);
    });
  }, [schedule, selectedFaculty, search]);

  const filteredRoomSchedule = useMemo(() => {
    if (!search.trim()) return roomSchedule;
    const q = search.toLowerCase();
    return roomSchedule.filter((entry) => {
      const matchText =
        `${entry.subject} ${entry.subjectCode} ${entry.faculty} ${entry.className}`.toLowerCase();
      return matchText.includes(q);
    });
  }, [roomSchedule, search]);

  async function generateTimetable() {
    if (!selectedSectionId) {
      setError("Please select a target class section first.");
      return;
    }

    setGenerating(true);
    setError("");
    setNotice("");

    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/timetable/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "class",
            class_id: Number(selectedSectionId),
            max_time_seconds: 10,
          }),
        },
        getToken
      );

      const body = await res.json();
      if (!res.ok) {
        throw new Error(
          body?.detail || `Timetable optimization failed with status ${res.status}.`
        );
      }

      const result = body as GenerateResponse;
      setRawSchedule(result.schedule);
      const uiSchedule = result.schedule.map(toUiEntry);
      setSchedule(uiSchedule);
      setSolverStatus(result.solver_status);
      setSolveTimeSeconds(result.solve_time_seconds ?? null);
      setWorkingHours(result.working_hours);
      setConfigStatus(result.configuration_status ?? null);
      setValidationReport(result.validation ?? null);
      setHasGenerated(true);
      setIsPublished(false);
      setPublishedVersion(null);
      const timeInfo =
        result.solve_time_seconds !== undefined
          ? ` in ${result.solve_time_seconds}s`
          : "";
      setNotice(
        `Generated ${result.weekly_sessions_scheduled} verified periods for ${
          selectedSection?.name ?? "Section"
        } (Semester ${selectedSection?.semester})${timeInfo}. Solver: ${result.solver_status.toUpperCase()} (0 Clashes).`
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "An unexpected error occurred while generating the timetable."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handlePublish() {
    if (schedule.length === 0 || rawSchedule.length === 0) {
      setError("Generate a timetable before publishing.");
      return;
    }
    if (validationReport && !validationReport.is_valid) {
      setError("Cannot publish timetable with unresolved conflicts.");
      return;
    }

    setPublishing(true);
    setError("");
    setNotice("");

    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/timetable/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Timetable for ${selectedSection?.name || "Section"} (Semester ${selectedSection?.semester || 1})`,
            scope: "class",
            class_id: Number(selectedSectionId),
            solver_status: solverStatus || "optimal",
            schedule: rawSchedule,
          }),
        },
        getToken
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to publish timetable.");
      }

      setIsPublished(true);
      setPublishedVersion(data.version);
      setNotice(
        `Master timetable permanently published as Version ${data.version}! Stored in database and synchronized across Faculty, Student, and Room schedules.`
      );
      void refreshPublishedTimetables();
      if (selectedRoomId) void loadRoomSchedule(selectedRoomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication failed.");
    } finally {
      setPublishing(false);
    }
  }

  const loadPastPublishedVersion = async (pubId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/timetable/published/${pubId}`, {}, getToken);
      if (res.ok) {
        const data: PublishedTimetable = await res.json();
        if (data.schedule && data.schedule.length > 0) {
          setRawSchedule(data.schedule);
          setSchedule(data.schedule.map(toUiEntry));
          setIsPublished(true);
          setPublishedVersion(data.version);
          setSolverStatus(data.solver_status as "optimal" | "feasible");
          setHasGenerated(true);
          if (data.class_id) setSelectedSectionId(String(data.class_id));
          setShowHistoryModal(false);
          setNotice(`Loaded published timetable Version ${data.version} ('${data.title}').`);
        }
      }
    } catch {
      setError("Failed to load historical timetable version.");
    }
  };

  function exportCsv() {
    const activeData =
      viewMode === "room"
        ? filteredRoomSchedule
        : viewMode === "faculty"
        ? facultyFilteredSchedule
        : filteredSchedule;

    if (activeData.length === 0) {
      setNotice("No schedule data available to export.");
      return;
    }

    const header = "Day,Period,Start,End,Subject,Subject Code,Faculty,Room,Type,Section";
    const rows = activeData.map((entry) =>
      [
        entry.day,
        entry.periodName,
        entry.startTime,
        entry.endTime,
        entry.subject,
        entry.subjectCode,
        entry.faculty,
        entry.room,
        entry.type,
        entry.className,
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    );

    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const prefix =
      viewMode === "room"
        ? `room-${selectedRoom?.name || "occupancy"}`
        : viewMode === "faculty"
        ? `faculty-${selectedFaculty?.name || "schedule"}`
        : `section-${selectedSection?.name || "timetable"}`;
    link.download = `optisched-${prefix.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Schedule exported to CSV format.");
  }

  return (
    <PortalShell
      role="admin"
      userName={userName}
      userEmail={userEmail}
      title={
        activeTab === "academic-data" || activeTab === "curriculum" || activeTab === "faculty"
          ? "Academic Data Management"
          : activeTab === "settings"
            ? "Semester Timing Configuration"
            : activeTab === "users"
              ? "User & Access Management"
              : activeTab === "system"
                ? "System Monitoring & Analytics"
                : "Master Timetable Operations"
      }
      activeTab={activeTab}
      onTabChange={(t) => {
        const next = t as
          | "dashboard"
          | "academic-data"
          | "faculty"
          | "curriculum"
          | "settings"
          | "users"
          | "system";
        if (next === "dashboard") {
          void refreshSections();
          void refreshPublishedTimetables();
        } else if (next === "users") {
          void refreshUsersList();
        } else if (next === "system") {
          void refreshSystemStatus();
        }
        setActiveTab(next);
      }}
      actions={
        activeTab === "dashboard" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search schedule..."
                className="h-8 w-36 rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 sm:w-44"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="View published versions history"
            >
              <History className="h-3.5 w-3.5" />
              <span>History ({publishedTimetables.length})</span>
            </button>

            <button
              onClick={exportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>

            {viewMode === "section" && (
              <button
                onClick={generateTimetable}
                disabled={generating || loadingSections || !selectedSectionId}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                <WandSparkles className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
                <span>{generating ? "Solving Constraints..." : "Generate Master"}</span>
              </button>
            )}

            {hasGenerated && viewMode === "section" && (
              <button
                onClick={handlePublish}
                disabled={isPublished || publishing}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-xs transition-colors",
                  isPublished
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                )}
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>
                  {publishing
                    ? "Publishing..."
                    : isPublished
                    ? `Published (v${publishedVersion ?? 1})`
                    : "Publish"}
                </span>
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => setActiveTab("dashboard")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <span>Back to Timetable Operations</span>
          </button>
        )
      }
    >
      {notice && (
        <div className="mb-5 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{notice}</span>
          </span>
          <button
            onClick={() => setNotice("")}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" />
            <span>{error}</span>
          </span>
          <button
            onClick={() => setError("")}
            className="text-rose-700 hover:text-rose-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(activeTab === "academic-data" || activeTab === "curriculum" || activeTab === "faculty") && (
        <AcademicDataManagement
          onNavigateToTimetable={() => {
            void refreshSections();
            void refreshPublishedTimetables();
            setActiveTab("dashboard");
          }}
          onNavigateToSettings={() => setActiveTab("settings")}
        />
      )}
      {activeTab === "settings" && (
        <TimetableSettings
          key={settingsSemester}
          initialSemester={settingsSemester}
          onConfigSaved={(sem) => {
            void refreshConfigurationsList();
            setNotice(`Saved timetable settings for Semester ${sem}.`);
          }}
        />
      )}

      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* View Mode & Selection Controls Bar */}
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>Academic Year 2026–2027</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>
                  {viewMode === "section"
                    ? selectedSection
                      ? `Semester ${selectedSection.semester}`
                      : "No section selected"
                    : viewMode === "room"
                    ? `Room: ${selectedRoom?.name || "Select Room"}`
                    : `Faculty: ${selectedFaculty?.name || "Select Faculty"}`}
                </span>
                {isPublished && viewMode === "section" && (
                  <span className="rounded-xs bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold tracking-wide text-emerald-800 uppercase">
                    Published v{publishedVersion ?? 1}
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                Master Schedule Workspace
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Feature 3: Section / Faculty / Room View Selector */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setViewMode("section")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                    viewMode === "section"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>Section View</span>
                </button>
                <button
                  onClick={() => setViewMode("faculty")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                    viewMode === "faculty"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Faculty View</span>
                </button>
                <button
                  onClick={() => {
                    setViewMode("room");
                    if (selectedRoomId) void loadRoomSchedule(selectedRoomId);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                    viewMode === "room"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Building className="h-3.5 w-3.5" />
                  <span>Room View</span>
                </button>
              </div>

              {/* View-Specific Context Dropdowns */}
              {viewMode === "section" && (
                <>
                  <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs">
                    <span className="font-medium text-slate-500">Section:</span>
                    <select
                      value={selectedSectionId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedSectionId(id);
                        const sec = sections.find((s) => String(s.id) === id);
                        if (sec) {
                          setSettingsSemester(sec.semester);
                          if (semesterConfigsMap[sec.semester]?.working_hours) {
                            setWorkingHours(semesterConfigsMap[sec.semester].working_hours);
                          }
                        }
                        setSchedule([]);
                        setRawSchedule([]);
                        setHasGenerated(false);
                        setIsPublished(false);
                        setPublishedVersion(null);
                        setSolveTimeSeconds(null);
                        void checkLatestPublishedForSection(id);
                      }}
                      className="bg-transparent font-semibold text-slate-900 outline-none"
                    >
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Sem {s.semester}, {s.student_count ?? 60} std)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </label>

                  {selectedSection && (
                    <button
                      onClick={() => {
                        setSettingsSemester(selectedSection.semester);
                        setActiveTab("settings");
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Configure Sem {selectedSection.semester} Timing
                    </button>
                  )}
                </>
              )}

              {viewMode === "faculty" && (
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs">
                  <span className="font-medium text-slate-500">Faculty:</span>
                  <select
                    value={selectedFacultyId}
                    onChange={(e) => setSelectedFacultyId(e.target.value)}
                    className="bg-transparent font-semibold text-slate-900 outline-none"
                  >
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.employee_id}) — {f.department}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </label>
              )}

              {viewMode === "room" && (
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-xs">
                  <span className="font-medium text-slate-500">Room:</span>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedRoomId(id);
                      if (id) void loadRoomSchedule(id);
                    }}
                    className="bg-transparent font-semibold text-slate-900 outline-none"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.room_type === "lab" ? "Lab" : "Classroom"}, Cap: {r.capacity})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </label>
              )}
            </div>
          </div>

          {/* Operational Status Strip */}
          <div className="grid grid-cols-2 divide-x divide-y sm:divide-y-0 sm:grid-cols-4 rounded-lg border border-slate-200 bg-white shadow-xs">
            <div className="p-4">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                {viewMode === "room"
                  ? "Selected Room"
                  : viewMode === "faculty"
                  ? "Selected Faculty"
                  : "Target Section"}
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900 truncate">
                {viewMode === "room"
                  ? selectedRoom?.name || "None"
                  : viewMode === "faculty"
                  ? selectedFaculty?.name || "None"
                  : selectedSection?.name || "None"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                {viewMode === "room"
                  ? `${selectedRoom?.room_type === "lab" ? "Laboratory" : "Classroom"} · Cap: ${
                      selectedRoom?.capacity ?? "—"
                    } seats`
                  : viewMode === "faculty"
                  ? `${selectedFaculty?.department || "Department"} · ${selectedFaculty?.employee_id || ""}`
                  : `${selectedSection?.department || "Department"} · Strength: ${
                      selectedSection?.student_count ?? 60
                    }`}
              </p>
            </div>

            <div className="p-4">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                Operating Window
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                {workingHours}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {configStatus === "saved"
                  ? "Configured schedule"
                  : "Standard campus hours"}
              </p>
            </div>

            <div className="p-4">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                Constraint Health
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                {hasGenerated
                  ? validationReport?.is_valid
                    ? "0 Clashes"
                    : `${validationReport?.total_clashes} Conflicts`
                  : isPublished
                  ? "Verified Published"
                  : "Unchecked"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {hasGenerated && validationReport?.is_valid
                  ? "Faculty, room & capacity verified"
                  : isPublished
                  ? "Permanent DB active schedule"
                  : "Awaiting solver run"}
              </p>
            </div>

            <div className="p-4">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                Occupancy / Periods
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
                {viewMode === "room"
                  ? `${filteredRoomSchedule.length} Room Periods`
                  : viewMode === "faculty"
                  ? `${facultyFilteredSchedule.length} Faculty Periods`
                  : hasGenerated
                  ? `${filteredSchedule.length} Periods`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                {viewMode === "room"
                  ? `${selectedRoomMeta?.building || "Main Campus"} · Cap ${selectedRoomMeta?.capacity || ""}`
                  : hasGenerated
                  ? `${solverStatus?.toUpperCase()}${solveTimeSeconds !== null ? ` (${solveTimeSeconds}s)` : ""}`
                  : "Ready for generation"}
              </p>
            </div>
          </div>

          {/* Validation Diagnostics Banner */}
          {validationReport && !validationReport.is_valid && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-700" />
                <span>Scheduling Infeasibility Detected</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validationReport.details.faculty_clashes.map((c, i) => (
                  <li key={`f-${i}`}>{c}</li>
                ))}
                {validationReport.details.room_clashes.map((c, i) => (
                  <li key={`r-${i}`}>{c}</li>
                ))}
                {validationReport.details.section_clashes.map((c, i) => (
                  <li key={`s-${i}`}>{c}</li>
                ))}
                {validationReport.details.eligibility_violations.map((c, i) => (
                  <li key={`e-${i}`}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Active Timetable Matrix (Section, Room, or Faculty) */}
          {viewMode === "section" && (
            <TimetableGrid
              schedule={filteredSchedule}
              title={`Master Schedule: ${selectedSection?.name || "All Sections"}`}
              subtitle={
                selectedSection
                  ? `Department of ${selectedSection.department} · Semester ${selectedSection.semester} · Working Hours: ${workingHours} · Student Count: ${selectedSection.student_count ?? 60}`
                  : undefined
              }
              workingHours={workingHours}
              emptyMessage="No master timetable generated yet. Select a section and click 'Generate Master' or publish a schedule."
            />
          )}

          {viewMode === "room" && (
            <TimetableGrid
              schedule={filteredRoomSchedule}
              title={`Room Weekly Occupancy: ${selectedRoom?.name || "Room"}`}
              subtitle={`${
                selectedRoom?.room_type === "lab" ? "Laboratory" : "Classroom"
              } · Capacity: ${selectedRoom?.capacity ?? "—"} seats · Building: ${
                selectedRoom?.building || "Main Campus"
              } · ${filteredRoomSchedule.length} occupied slots across verified published timetables`}
              workingHours={workingHours}
              emptyMessage={
                loadingRoomSchedule
                  ? "Loading room schedule..."
                  : `Room ${selectedRoom?.name || ""} has 0 scheduled classes. Entire weekly schedule is available.`
              }
            />
          )}

          {viewMode === "faculty" && (
            <TimetableGrid
              schedule={facultyFilteredSchedule}
              title={`Faculty Schedule: ${selectedFaculty?.name || "Faculty"}`}
              subtitle={`${selectedFaculty?.department || ""} · Employee ID: ${
                selectedFaculty?.employee_id || ""
              } · ${facultyFilteredSchedule.length} assigned teaching periods`}
              workingHours={workingHours}
              emptyMessage={`No assigned periods found for ${
                selectedFaculty?.name || "this faculty member"
              } in active schedules.`}
            />
          )}
        </div>
      )}

      {/* Admin User Management Tab */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                User & Access Control Management
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Create and manage university administrator, faculty, and student accounts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                <span>Password Policy: Min 8 Characters (bcrypt)</span>
              </span>
              <button
                onClick={() => void refreshUsersList()}
                disabled={loadingUsers}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingUsers && "animate-spin")} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {userActionNotice && (
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{userActionNotice}</span>
              </span>
              <button onClick={() => setUserActionNotice("")} className="text-emerald-700 hover:text-emerald-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {userActionError && (
            <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>{userActionError}</span>
              </span>
              <button onClick={() => setUserActionError("")} className="text-rose-700 hover:text-rose-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Create Account Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                <div className="rounded-lg bg-slate-900 p-2 text-white">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Account</h3>
                  <p className="text-[11px] text-slate-500">Add an administrator or university member.</p>
                </div>
              </div>

              {hasRestoredUserDraft && (
                <div className="mb-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                  <span>Restored unsaved draft values.</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearUserDraft();
                      setNewUserName("");
                      setNewUserEmail("");
                      setNewUserRole("student");
                      setNewUserPassword("");
                    }}
                    className="font-semibold underline hover:text-amber-950"
                  >
                    Discard
                  </button>
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label htmlFor="new-user-name" className="block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    id="new-user-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={activeUserName}
                    onChange={(e) => {
                      setNewUserName(e.target.value);
                      saveUserDraft({ name: e.target.value });
                    }}
                    placeholder="e.g. Dr. Jane Doe"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="new-user-email" className="block text-xs font-semibold text-slate-700">Email Address *</label>
                  <input
                    id="new-user-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    spellCheck={false}
                    value={activeUserEmail}
                    onChange={(e) => {
                      setNewUserEmail(e.target.value);
                      saveUserDraft({ email: e.target.value });
                    }}
                    placeholder="admin@optisched.com"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="new-user-role" className="block text-xs font-semibold text-slate-700">System Role *</label>
                  <select
                    id="new-user-role"
                    name="role"
                    value={activeUserRole}
                    onChange={(e) => {
                      const role = e.target.value as "admin" | "faculty" | "student";
                      setNewUserRole(role);
                      saveUserDraft({ role });
                    }}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  >
                    <option value="admin">Administrator (Full Access)</option>
                    <option value="faculty">Faculty (Teaching Schedule)</option>
                    <option value="student">Student (Timetable Viewer)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="new-user-password" className="block text-xs font-semibold text-slate-700">Password *</label>
                    <span
                      className={cn(
                        "text-[10px] font-semibold",
                        newUserPassword.length >= MIN_PASSWORD_LENGTH
                          ? "text-emerald-600"
                          : "text-slate-400"
                      )}
                    >
                      {newUserPassword.length >= MIN_PASSWORD_LENGTH
                        ? "✓ Valid (8+ chars)"
                        : `${newUserPassword.length}/${MIN_PASSWORD_LENGTH} min chars`}
                    </span>
                  </div>
                  <input
                    id="new-user-password"
                    name="new-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className={cn(
                      "mt-1 w-full rounded-md border px-3 py-2 text-xs text-slate-900 focus:outline-hidden",
                      newUserPassword && newUserPassword.length < MIN_PASSWORD_LENGTH
                        ? "border-rose-300 focus:border-rose-500"
                        : "border-slate-200 focus:border-slate-900"
                    )}
                  />
                  <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                    Stored securely using salted bcrypt hashing ($2b$, 12 rounds). Plain-text passwords are never saved.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={creatingUser || newUserPassword.length < MIN_PASSWORD_LENGTH || !activeUserEmail}
                  className="w-full rounded-md bg-slate-900 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
                >
                  {creatingUser ? "Creating Account..." : "Create Account"}
                </button>
              </form>
            </div>

            {/* Registered Users Table Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
              <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Registered Accounts ({usersList.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Accounts identified by 26-character Crockford Base32 ULIDs.
                  </p>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search accounts..."
                    className="h-8 w-48 rounded-md border border-slate-200 pl-8 pr-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              {loadingUsers ? (
                <div className="py-12 text-center text-xs text-slate-500">Loading user accounts...</div>
              ) : usersList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No registered accounts found. Click &apos;Refresh&apos; or create a new user.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="px-3 py-2.5">User</th>
                        <th className="px-3 py-2.5">Role</th>
                        <th className="px-3 py-2.5">ULID Identifier</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {usersList
                        .filter(
                          (u) =>
                            !userSearch ||
                            u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
                            (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase())) ||
                            u.role.toLowerCase().includes(userSearch.toLowerCase())
                        )
                        .map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-900">{u.name || "—"}</div>
                              <div className="text-[11px] text-slate-500">{u.email}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                                  u.role === "admin"
                                    ? "bg-slate-900 text-white"
                                    : u.role === "faculty"
                                    ? "bg-blue-50 text-blue-800"
                                    : "bg-emerald-50 text-emerald-800"
                                )}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[10px] text-slate-500">
                              {u.id}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-[11px] font-medium",
                                  u.is_active !== false ? "text-emerald-600" : "text-slate-400"
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    u.is_active !== false ? "bg-emerald-500" : "bg-slate-300"
                                  )}
                                />
                                {u.is_active !== false ? "Active" : "Disabled"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                onClick={() => void handleDeleteUser(u.id, u.email)}
                                title="Delete User Account"
                                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin System Monitoring Tab */}
      {activeTab === "system" && (
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                System Monitoring & Dashboard Analytics
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Real-time operational metrics, infrastructure health, and security policy status.
              </p>
            </div>
            <button
              onClick={() => void refreshSystemStatus()}
              disabled={loadingSystemStatus}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loadingSystemStatus && "animate-spin")} />
              <span>Refresh Status</span>
            </button>
          </div>

          {/* Operational Status Badges */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Activity className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
                <span>Service Health</span>
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {systemStatus?.status === "healthy" ? "Operational" : "Active"}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {systemStatus?.service || "OptiSched University Platform"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Building className="h-3.5 w-3.5 text-slate-600" />
                <span>Persistence Layer</span>
              </div>
              <div className="mt-2 text-xl font-bold text-slate-900">
                {systemStatus?.database?.connected ? "Connected" : "Online"}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Engine: {systemStatus?.database?.engine || "PostgreSQL (Neon)"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <KeyRound className="h-3.5 w-3.5 text-slate-600" />
                <span>Password Policy</span>
              </div>
              <div className="mt-2 text-xl font-bold text-emerald-700">
                Min {systemStatus?.password_policy?.min_length ?? 8} Characters
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Algorithm: {systemStatus?.password_policy?.hashing_algorithm || "bcrypt"} ($2b$, 12 rounds)
              </p>
            </div>
          </div>

          {/* Analytics Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900">Academic Operations Metrics</h3>
            <p className="text-[11px] text-slate-500">
              Live count of institutional resources managed by the platform.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Total Users</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.total_users ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">
                  {systemStatus?.analytics?.admins ?? 0} Admins · {systemStatus?.analytics?.faculty_users ?? 0} Faculty
                </span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Sections</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.sections ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">Active student classes</span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Subjects</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.subjects ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">Theory & Lab courses</span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Faculty</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.faculty_members ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">Qualified professors</span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Rooms</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.rooms ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">Labs & lecture halls</span>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Timetables</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {systemStatus?.analytics?.published_timetables ?? "—"}
                </div>
                <span className="text-[10px] text-slate-400">Published verified schedules</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature 4: Version History Modal (Google Chrome Modern Web Guidance) */}
      <dialog
        ref={historyDialogRef}
        aria-labelledby="history-modal-title"
        onClose={() => setShowHistoryModal(false)}
        onClick={(e) => {
          const dialog = e.currentTarget;
          const rect = dialog.getBoundingClientRect();
          const isInDialog = (
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width
          );
          if (!isInDialog) dialog.close();
        }}
        className="m-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-xs open:flex open:flex-col"
      >
        {showHistoryModal && (
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-slate-100 p-2 text-slate-800">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="history-modal-title" className="text-base font-bold text-slate-900">Published Timetable Versions</h3>
                  <p className="text-xs text-slate-500">
                    Audit log of permanently stored timetables generated by Google OR-Tools CP-SAT.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => historyDialogRef.current?.close()}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {publishedTimetables.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <History className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-2 font-semibold text-slate-900">No timetables published yet</p>
                  <p className="text-[11px]">
                    Generate a timetable in Section View and click &apos;Publish&apos; to permanently store it.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Version</th>
                      <th className="px-4 py-2.5">Title / Target</th>
                      <th className="px-4 py-2.5">Solver Status</th>
                      <th className="px-4 py-2.5">Scheduled Sessions</th>
                      <th className="px-4 py-2.5">Published At</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {publishedTimetables.map((pub) => (
                      <tr key={pub.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                            v{pub.version}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{pub.title}</p>
                          <p className="text-[11px] text-slate-500">
                            Scope: {pub.scope} {pub.class_id ? `(Class #${pub.class_id})` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                              pub.solver_status === "optimal"
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-blue-50 text-blue-800"
                            )}
                          >
                            {pub.solver_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium">
                          {pub.weekly_sessions_scheduled} periods
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {pub.created_at ? new Date(pub.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => void loadPastPublishedVersion(pub.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Load</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => historyDialogRef.current?.close()}
                className="rounded-md border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </PortalShell>
  );
}
