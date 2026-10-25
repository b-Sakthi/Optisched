"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  WandSparkles,
  X,
  Share2,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { FacultyManagement } from "@/components/FacultyManagement";
import { TimetableSettings } from "@/components/TimetableSettings";
import { CurriculumManagement } from "@/components/CurriculumManagement";
import { TimetableGrid } from "@/components/TimetableGrid";
import { API_BASE_URL, fetchWithAuth, toUiEntry } from "@/lib/api";
import { Section, GenerateResponse, ValidationReport, ScheduleEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";

export default function AdminClientView({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<"dashboard" | "faculty" | "curriculum" | "settings">("dashboard");

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [settingsSemester, setSettingsSemester] = useState<number>(1);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadingSections, setLoadingSections] = useState(true);

  // Timetable solver and config states
  const [solverStatus, setSolverStatus] = useState<"optimal" | "feasible" | null>(null);
  const [workingHours, setWorkingHours] = useState("09:00-16:00");
  const [scheduledSpan, setScheduledSpan] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<"saved" | "fallback" | "custom_request" | "mixed" | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [savedSemestersList, setSavedSemestersList] = useState<number[]>([]);
  const [semesterConfigsMap, setSemesterConfigsMap] = useState<
    Record<number, { working_hours: string; configured: boolean }>
  >({});
  const [notes, setNotes] = useState<string[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  const refreshConfigurationsList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/timetable/configurations`);
      if (res.ok) {
        const list: { semester: number; working_hours: string; configured: boolean }[] =
          await res.json();
        setSavedSemestersList(list.map((c) => c.semester));
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

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [secRes, cfgRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/sections`),
          fetch(`${API_BASE_URL}/api/timetable/configurations`),
        ]);

        if (!secRes.ok) throw new Error(`Could not load sections (${secRes.status})`);
        const data: Section[] = await secRes.json();
        if (!active) return;
        const activeSections = data.filter((s) => s.is_active);
        setSections(activeSections);

        const initialCfgMap: Record<number, { working_hours: string; configured: boolean }> = {};
        if (cfgRes.ok) {
          const cfgList: { semester: number; working_hours: string; configured: boolean }[] =
            await cfgRes.json();
          if (active) {
            setSavedSemestersList(cfgList.map((c) => c.semester));
            for (const c of cfgList) {
              initialCfgMap[c.semester] = {
                working_hours: c.working_hours,
                configured: Boolean(c.configured),
              };
            }
            setSemesterConfigsMap(initialCfgMap);
          }
        }

        if (activeSections.length > 0) {
          setSelectedSectionId(String(activeSections[0].id));
          setSettingsSemester(activeSections[0].semester);
          const sem = activeSections[0].semester;
          if (initialCfgMap[sem]?.working_hours) {
            setWorkingHours(initialCfgMap[sem].working_hours);
          }
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? `${e.message}. Confirm the FastAPI backend is running.`
              : "Could not connect to the backend."
          );
        }
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

  const filteredSchedule = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedule.filter((entry) => {
      const belongsToSelectedSection =
        !selectedSection || entry.className === selectedSection.name;
      const matchesSearch =
        !query ||
        `${entry.subject} ${entry.subjectCode} ${entry.faculty} ${entry.room}`
          .toLowerCase()
          .includes(query);
      return belongsToSelectedSection && matchesSearch;
    });
  }, [schedule, search, selectedSection]);

  async function generateTimetable() {
    if (!selectedSectionId) {
      setError("No active section is available. Add a section first.");
      return;
    }

    setGenerating(true);
    setError("");
    setNotice("");

    try {
      const response = await fetchWithAuth(
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

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          typeof body?.detail === "string"
            ? body.detail
            : `Generation failed (${response.status}).`;
        throw new Error(detail);
      }

      const result = body as GenerateResponse;
      const mapped = (result.schedule ?? []).map(toUiEntry);
      setSchedule(mapped);
      setSolverStatus(result.solver_status);
      setWorkingHours(result.working_hours || "09:00-16:00");
      setScheduledSpan(result.scheduled_span ?? null);
      setConfigStatus(result.configuration_status ?? null);
      setValidationReport(result.validation ?? null);
      setNotes(result.notes || []);
      setHasGenerated(true);
      setIsPublished(false); // New generation is unpublished until reviewed
      setNotice(
        `Generated ${result.weekly_sessions_scheduled} sessions for ${
          selectedSection?.name ?? "the section"
        } (Semester ${selectedSection?.semester}). Solver: ${result.solver_status}.`
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}`
          : "An unexpected error occurred while generating the timetable."
      );
    } finally {
      setGenerating(false);
    }
  }

  function handlePublish() {
    if (schedule.length === 0) {
      setError("Generate a timetable before publishing.");
      return;
    }
    if (validationReport && !validationReport.is_valid) {
      setError("Cannot publish timetable with unresolved conflicts.");
      return;
    }
    setIsPublished(true);
    setNotice("Master timetable successfully verified and published to Student and Faculty portals.");
  }

  function exportCsv() {
    if (schedule.length === 0) {
      setNotice("Generate a timetable before exporting it.");
      return;
    }

    const header = "Day,Period,Start,End,Subject,Subject Code,Faculty,Room,Type,Section";
    const rows = schedule.map((entry) =>
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
    link.download = `optisched-${(selectedSection?.name ?? "timetable").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Generated timetable exported to CSV.");
  }

  return (
    <PortalShell
      role="admin"
      userName={userName}
      userEmail={userEmail}
      title={
        activeTab === "faculty"
          ? "Faculty Management"
          : activeTab === "curriculum"
          ? "Curriculum & Infrastructure"
          : activeTab === "settings"
          ? "Semester Timing Configuration"
          : "Admin Dashboard & Master Timetable"
      }
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as any)}
      actions={
        activeTab === "dashboard" ? (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-[#e7e9ef] px-3 py-2">
              <Search size={14} className="text-[#9a9eaa]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter timetable..."
                className="w-32 bg-transparent text-xs outline-none placeholder:text-[#a5a8b2] sm:w-36"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-xl border border-[#e5e7ee] bg-white px-3 py-2 text-xs font-semibold text-[#555b69] hover:bg-[#f7f8fa]"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={generateTimetable}
              disabled={generating || loadingSections || !selectedSectionId}
              className="flex items-center gap-1.5 rounded-xl bg-[#343956] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#464d70] disabled:opacity-50"
            >
              <WandSparkles size={14} />
              {generating ? "Generating..." : "Generate Master"}
            </button>
            {hasGenerated && (
              <button
                onClick={handlePublish}
                disabled={isPublished}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition",
                  isPublished
                    ? "bg-emerald-600 text-white cursor-default"
                    : "bg-emerald-500 text-white hover:bg-emerald-600"
                )}
              >
                <Share2 size={14} />
                {isPublished ? "Published" : "Publish Timetable"}
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => setActiveTab("dashboard")}
            className="flex items-center gap-1.5 rounded-xl bg-[#343956] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#464d70]"
          >
            Back to Master Timetable
          </button>
        )
      }
    >
      {notice && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {notice}
          </span>
          <button onClick={() => setNotice("")}><X size={14} /></button>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} /> {error}
          </span>
          <button onClick={() => setError("")}><X size={14} /></button>
        </div>
      )}

      {activeTab === "faculty" && <FacultyManagement />}
      {activeTab === "curriculum" && <CurriculumManagement />}
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
          {/* Top Section Selection Bar */}
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#858a98]">
                <span>Academic Year 2026–27</span>
                <span className="h-1 w-1 rounded-full bg-[#c2c5ce]" />
                <span>{selectedSection ? `Semester ${selectedSection.semester}` : "Select a section"}</span>
                {isPublished && (
                  <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    PUBLISHED
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#1a1e2d]">
                Master Timetable Control
              </h2>
              <p className="mt-1 text-xs text-[#8a8f9d]">
                Coordinate university classes, faculty qualifications, room capacities, and automated OR-Tools scheduling.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-[#e3e5ec] bg-white px-3 py-2 text-xs">
                <span className="text-[#999eaa]">Section</span>
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
                    setHasGenerated(false);
                    setIsPublished(false);
                  }}
                  className="max-w-[180px] bg-transparent font-semibold outline-none"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Sem {s.semester})
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="text-[#8d92a0]" />
              </label>

              {selectedSection && (
                <button
                  onClick={() => {
                    setSettingsSemester(selectedSection.semester);
                    setActiveTab("settings");
                  }}
                  className="rounded-xl border border-[#d8dbe9] bg-[#f8f9fe] px-3 py-2 text-xs font-semibold text-[#454c80] hover:bg-[#eceffc]"
                >
                  Sem {selectedSection.semester} Settings
                </button>
              )}
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard
              title="Scheduled Sessions"
              value={hasGenerated ? String(filteredSchedule.length) : "—"}
              note={hasGenerated ? "Solver-generated periods" : "Awaiting generation"}
              icon={<CalendarDays size={18} />}
              status={hasGenerated ? "Success" : "Pending"}
            />
            <StatCard
              title="Working Hours"
              value={workingHours}
              note={configStatus === "saved" ? "Custom configured" : "Standard university hours"}
              icon={<Activity size={18} />}
              status={configStatus === "saved" ? "Configured" : "Default"}
            />
            <StatCard
              title="Hard Conflicts"
              value={
                hasGenerated
                  ? validationReport?.is_valid
                    ? "0 clashes"
                    : `${validationReport?.total_clashes} conflicts`
                  : "—"
              }
              note={
                hasGenerated
                  ? validationReport?.is_valid
                    ? "Verified 100% clash-free"
                    : "Conflict check needed"
                  : "Not checked"
              }
              icon={<ShieldCheck size={18} />}
              status={hasGenerated && validationReport?.is_valid ? "Verified" : "Pending"}
            />
            <StatCard
              title="Solver Engine"
              value={hasGenerated ? (solverStatus ? solverStatus.toUpperCase() : "OPTIMAL") : "CP-SAT"}
              note="Google OR-Tools solver"
              icon={<Sparkles size={18} />}
              status={hasGenerated ? "Optimal" : "Ready"}
            />
          </div>

          {/* Master Timetable Grid */}
          <TimetableGrid
            schedule={filteredSchedule}
            title={`Master Schedule: ${selectedSection?.name || "All Sections"}`}
            subtitle={
              selectedSection
                ? `Department of ${selectedSection.department} · Semester ${selectedSection.semester} · Working Hours: ${workingHours}`
                : undefined
            }
            workingHours={workingHours}
            emptyMessage="No master timetable generated yet. Click 'Generate Master' to run solver."
          />
        </div>
      )}
    </PortalShell>
  );
}

function StatCard({
  title,
  value,
  note,
  icon,
  status,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  status: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e7e9ef] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-xs font-medium text-[#858a98]">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3f4f9] text-[#656d9f]">
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-[#1f2438]">{value}</p>
          <p className="mt-1 text-[10px] text-[#9a9eaa]">{note}</p>
        </div>
        <span className="rounded-lg bg-[#f4f5f8] px-2 py-1 text-[10px] font-semibold text-[#737989]">
          {status}
        </span>
      </div>
    </div>
  );
}
