"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  UserCheck,
  ChevronDown,
  X,
  GraduationCap,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { TimetableGrid } from "@/components/TimetableGrid";
import { API_BASE_URL, fetchWithAuth, toUiEntry } from "@/lib/api";
import { Section, FacultyMember, ScheduleEntry, GenerateResponse } from "@/lib/types";

export default function StudentClientView({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
  userRole?: string;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState("all");

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00-16:00");
  const [isOfficialPublished, setIsOfficialPublished] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [secRes, facRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
        ]);

        if (secRes.ok && active) {
          const secData: Section[] = await secRes.json();
          const activeSecs = secData.filter((s) => s.is_active);
          setSections(activeSecs);
          if (activeSecs.length > 0) {
            setSelectedSectionId(String(activeSecs[0].id));
            void loadTimetable(activeSecs[0].id);
          }
        }
        if (facRes.ok && active) {
          const facData: FacultyMember[] = await facRes.json();
          setFacultyList(facData);
        }
      } catch {
        // Silently handled
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  async function loadTimetable(sectionId: number) {
    try {
      // 1. Attempt to load the officially published timetable from permanent database
      const pubRes = await fetchWithAuth(
        `${API_BASE_URL}/api/timetable/published/latest?class_id=${sectionId}`
      );
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (pubData.status === "success" && pubData.schedule && pubData.schedule.length > 0) {
          setSchedule(pubData.schedule.map(toUiEntry));
          setIsOfficialPublished(true);
          setPublishedVersion(pubData.version);
          return;
        }
      }

      // 2. Fall back to live solver preview if not yet published
      setIsOfficialPublished(false);
      setPublishedVersion(null);
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/timetable/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "class",
            class_id: sectionId,
            max_time_seconds: 5,
          }),
        }
      );

      if (res.ok) {
        const data: GenerateResponse = await res.json();
        setSchedule((data.schedule ?? []).map(toUiEntry));
        if (data.working_hours) setWorkingHours(data.working_hours);
      }
    } catch {
      // Timetable lookup silent error
    }
  }

  const selectedSection = sections.find((s) => String(s.id) === selectedSectionId);

  // Filtered by search and faculty lookup
  const filteredSchedule = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedule.filter((entry) => {
      const matchesFaculty =
        selectedFacultyFilter === "all" ||
        entry.faculty.toLowerCase().includes(selectedFacultyFilter.toLowerCase());

      const matchesSearch =
        !q ||
        `${entry.subject} ${entry.subjectCode} ${entry.room} ${entry.faculty}`
          .toLowerCase()
          .includes(q);

      return matchesFaculty && matchesSearch;
    });
  }, [schedule, search, selectedFacultyFilter]);

  return (
    <PortalShell
      role="student"
      userName={userName}
      userEmail={userEmail}
      title="Student Schedule Portal"
      subtitle="Class schedule, period locations, and instructor details"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter course or room..."
              className="h-8 w-36 rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 sm:w-48"
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
        </div>
      }
    >
      <div className="space-y-6">
        {/* Section Context Header */}
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
              <GraduationCap className="h-3.5 w-3.5 text-emerald-700" />
              <span>Official Academic Timetable</span>
              {isOfficialPublished ? (
                <span className="rounded-xs bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold tracking-wide text-emerald-800 uppercase">
                  Published v{publishedVersion}
                </span>
              ) : (
                <span className="rounded-xs bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                  Draft Preview
                </span>
              )}
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
              {selectedSection
                ? `${selectedSection.name} Class Schedule`
                : "Student Class Schedule"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {selectedSection
                ? `Department of ${selectedSection.department} · Year ${selectedSection.academic_year} · Semester ${selectedSection.semester}`
                : "Select your registered section to view schedule."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Section Switcher */}
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
              <span className="font-medium text-slate-500">Section:</span>
              <select
                value={selectedSectionId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSectionId(id);
                  if (id) void loadTimetable(Number(id));
                }}
                className="bg-transparent font-semibold text-slate-900 outline-none"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Semester {s.semester})
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </label>

            {/* Faculty Instructor Filter */}
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
              <UserCheck className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedFacultyFilter}
                onChange={(e) => setSelectedFacultyFilter(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 outline-none"
              >
                <option value="all">All Instructors</option>
                {facultyList.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </label>
          </div>
        </div>

        {/* Timetable Matrix */}
        <TimetableGrid
          schedule={filteredSchedule}
          title={
            selectedSection
              ? `${selectedSection.name} Weekly Schedule`
              : "Weekly Schedule"
          }
          subtitle={
            selectedSection
              ? `Semester ${selectedSection.semester} · Scheduled Hours: ${workingHours}`
              : undefined
          }
          workingHours={workingHours}
          readOnly={true}
          emptyMessage="No classes scheduled for the selected section in the current timetable."
        />
      </div>
    </PortalShell>
  );
}
