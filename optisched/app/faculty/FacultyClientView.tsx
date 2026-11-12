"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  BookOpen,
  Briefcase,
  ChevronDown,
  X,
  UserCheck,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { TimetableGrid } from "@/components/TimetableGrid";
import { API_BASE_URL, fetchWithAuth, toUiEntry } from "@/lib/api";
import {
  FacultyMember,
  ScheduleEntry,
  Section,
  GenerateResponse,
  PublishedTimetable,
  FacultyAvailability,
} from "@/lib/types";

export default function FacultyClientView({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
  userRole?: string;
}) {
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);
  const [availabilityList, setAvailabilityList] = useState<FacultyAvailability[]>([]);

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [search, setSearch] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00-16:00");
  const [isOfficialPublished, setIsOfficialPublished] = useState(false);
  const [publishedCount, setPublishedCount] = useState<number>(0);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const [facRes, secRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
        ]);

        if (facRes.ok && active) {
          const facData: FacultyMember[] = await facRes.json();
          setFacultyList(facData);

          // Find faculty matching current user's email or name, otherwise default to first
          const matched =
            facData.find((f) => f.email.toLowerCase() === userEmail.toLowerCase()) ||
            facData.find((f) => f.name.toLowerCase() === userName.toLowerCase()) ||
            facData[0];

          if (matched) {
            setSelectedFacultyId(String(matched.id));
            setSelectedFaculty(matched);
            void loadFacultyTimetable();
            void loadFacultyAvailability(matched.id);
          }
        }
        if (!secRes.ok) {
          // Handled gracefully
        }
      } catch {
        // Handle error silently
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [userEmail, userName]);

  async function loadFacultyAvailability(facultyId: number) {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/faculty/${facultyId}/availability`);
      if (res.ok) {
        const data = await res.json();
        setAvailabilityList(data.availabilities || []);
      }
    } catch {
      setAvailabilityList([]);
    }
  }

  async function loadFacultyTimetable() {
    try {
      // 1. First attempt to load from permanent published timetables in the database
      const pubRes = await fetchWithAuth(`${API_BASE_URL}/api/timetable/published`);
      if (pubRes.ok) {
        const pubList: PublishedTimetable[] = await pubRes.json();
        const activePublished = pubList.filter((p) => p.is_active);
        if (activePublished.length > 0) {
          const allEntries: ScheduleEntry[] = [];
          for (const pub of activePublished) {
            const detailRes = await fetchWithAuth(`${API_BASE_URL}/api/timetable/published/${pub.id}`);
            if (detailRes.ok) {
              const fullPub: PublishedTimetable = await detailRes.json();
              if (fullPub.schedule) {
                const entries = fullPub.schedule.map(toUiEntry);
                allEntries.push(...entries);
              }
            }
          }
          if (allEntries.length > 0) {
            setSchedule(allEntries);
            setIsOfficialPublished(true);
            setPublishedCount(activePublished.length);
            return;
          }
        }
      }

      // 2. Fall back to preview generation if no timetable has been published yet
      setIsOfficialPublished(false);
      setPublishedCount(0);
      const secRes = await fetchWithAuth(`${API_BASE_URL}/api/sections`);
      if (!secRes.ok) return;
      const sections: Section[] = await secRes.json();
      const activeSecs = sections.filter((s) => s.is_active);

      const allEntries: ScheduleEntry[] = [];
      for (const sec of activeSecs) {
        const res = await fetchWithAuth(`${API_BASE_URL}/api/timetable/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "class",
            class_id: sec.id,
            max_time_seconds: 5,
          }),
        });

        if (res.ok) {
          const data: GenerateResponse = await res.json();
          const entries = (data.schedule ?? []).map(toUiEntry);
          allEntries.push(...entries);
          if (data.working_hours) setWorkingHours(data.working_hours);
        }
      }

      setSchedule(allEntries);
    } catch {
      // Handled silently
    }
  }

  // Filter schedule to only sessions taught by this faculty member
  const facultySchedule = useMemo(() => {
    if (!selectedFaculty) return [];
    const q = search.trim().toLowerCase();
    return schedule.filter((entry) => {
      const isMine =
        entry.faculty.toLowerCase().includes(selectedFaculty.name.toLowerCase()) ||
        selectedFaculty.name.toLowerCase().includes(entry.faculty.toLowerCase());

      const matchesSearch =
        !q ||
        `${entry.subject} ${entry.subjectCode} ${entry.room} ${entry.className}`
          .toLowerCase()
          .includes(q);

      return isMine && matchesSearch;
    });
  }, [schedule, selectedFaculty, search]);

  return (
    <PortalShell
      role="faculty"
      userName={selectedFaculty ? selectedFaculty.name : userName}
      userEmail={selectedFaculty ? selectedFaculty.email : userEmail}
      title="Faculty Teaching Schedule"
      subtitle="Personal course schedule and teaching load"
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
        {/* Faculty Profile and Teaching Assignment Card */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                  <UserCheck className="h-3.5 w-3.5 text-blue-700" />
                  <span>Verified Teaching Faculty</span>
                  {isOfficialPublished ? (
                    <span className="rounded-xs bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold tracking-wide text-emerald-800 uppercase">
                      Published Master ({publishedCount} sections)
                    </span>
                  ) : (
                    <span className="rounded-xs bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                      Draft Preview
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  {selectedFaculty ? selectedFaculty.name : "Teaching Faculty"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedFaculty
                    ? `Employee ID: ${selectedFaculty.employee_id} · Department of ${selectedFaculty.department}`
                    : "Assigned university teaching schedule"}
                </p>
              </div>

              {/* Faculty member switcher for administrative audit */}
              {facultyList.length > 1 && (
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                  <span className="font-medium text-slate-500">View Faculty:</span>
                  <select
                    value={selectedFacultyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedFacultyId(id);
                      const fac = facultyList.find((f) => String(f.id) === id);
                      if (fac) {
                        setSelectedFaculty(fac);
                        void loadFacultyTimetable();
                        void loadFacultyAvailability(fac.id);
                      }
                    }}
                    className="bg-transparent font-semibold text-slate-900 outline-none"
                  >
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.department})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </label>
              )}
            </div>

            {/* Qualified Subjects List */}
            {selectedFaculty && selectedFaculty.qualifications.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Qualified Curriculum Subjects
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedFaculty.qualifications.map((q) => (
                    <span
                      key={q.subject_id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
                    >
                      <BookOpen className="h-3 w-3 text-slate-500" />
                      <span className="font-semibold text-slate-900">{q.code}:</span>
                      <span>{q.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Configured Availability / Blackout Hours */}
            {selectedFaculty && availabilityList.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                  <ShieldCheck className="h-3 w-3 text-rose-600" />
                  <span>Configured Blackout Windows (CP-SAT Constraint Active)</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availabilityList.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800"
                    >
                      <Clock className="h-3 w-3 text-rose-600" />
                      <span className="font-semibold">{a.day}:</span>
                      <span>{a.start_time}–{a.end_time}</span>
                      <span className="text-slate-500">({a.reason || "Blocked"})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Workload Indicator */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Weekly Teaching Load
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                <Briefcase className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {selectedFaculty ? selectedFaculty.weekly_workload : facultySchedule.length}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  periods / week
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Course offering allocation in active academic catalog.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>Scheduled Sessions:</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {facultySchedule.length} period{facultySchedule.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        <TimetableGrid
          schedule={facultySchedule}
          title={
            selectedFaculty
              ? `${selectedFaculty.name} Teaching Schedule`
              : "Teaching Schedule"
          }
          subtitle={`Department of ${selectedFaculty?.department || "University"} · Scheduled Window: ${workingHours}`}
          workingHours={workingHours}
          readOnly={true}
          emptyMessage="No teaching sessions scheduled for this faculty member in the active timetable."
        />
      </div>
    </PortalShell>
  );
}
