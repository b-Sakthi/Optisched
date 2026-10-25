"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Search,
  BookOpen,
  Clock,
  Briefcase,
  ChevronDown,
  Building,
  GraduationCap,
  Award,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { TimetableGrid } from "@/components/TimetableGrid";
import { API_BASE_URL, fetchWithAuth, toUiEntry } from "@/lib/api";
import { FacultyMember, ScheduleEntry, Section, GenerateResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function FacultyClientView({
  userName,
  userEmail,
  userRole,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00-16:00");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [facRes, secRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
        ]);

        if (facRes.ok) {
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
            loadFacultyTimetable(matched.name);
          }
        }
      } catch {
        // Handle error silently
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [userEmail, userName]);

  async function loadFacultyTimetable(facultyName: string) {
    try {
      // Fetch sections to get full schedule
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
      // Silent error
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
      title="Faculty Teaching Schedule & Workload"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#e7e9ef] px-3 py-1.5 text-xs">
            <Search size={14} className="text-[#9a9eaa]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects or rooms..."
              className="w-36 bg-transparent outline-none placeholder:text-[#a5a8b2]"
            />
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Workload and Profile Header */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#e8eaf0] bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>Teaching Assignment (Read-Only)</span>
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-[#1f2438]">
                  {selectedFaculty ? selectedFaculty.name : "Teaching Faculty"}
                </h2>
                <p className="mt-0.5 text-xs text-[#8a8f9d]">
                  {selectedFaculty
                    ? `Employee ID: ${selectedFaculty.employee_id} · Department of ${selectedFaculty.department}`
                    : "Assigned university teaching schedule"}
                </p>
              </div>

              {/* Faculty member switcher (for admin preview or multi-account) */}
              <label className="flex items-center gap-2 rounded-xl border border-[#e3e5ec] bg-[#f9fafc] px-3 py-2 text-xs">
                <span className="text-[#999eaa]">Faculty:</span>
                <select
                  value={selectedFacultyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedFacultyId(id);
                    const fac = facultyList.find((f) => String(f.id) === id);
                    if (fac) {
                      setSelectedFaculty(fac);
                      loadFacultyTimetable(fac.name);
                    }
                  }}
                  className="bg-transparent font-semibold outline-none"
                >
                  {facultyList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.department})
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} className="text-[#8d92a0]" />
              </label>
            </div>

            {/* Qualifications Chips */}
            {selectedFaculty && selectedFaculty.qualifications.length > 0 && (
              <div className="mt-4 border-t border-[#edf0f5] pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#9296a3]">
                  Qualified Subjects
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedFaculty.qualifications.map((q) => (
                    <span
                      key={q.subject_id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#e0e3f3] bg-[#f4f5fb] px-2 py-0.5 text-[11px] font-medium text-[#454c80]"
                    >
                      <BookOpen size={11} /> {q.code}: {q.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Workload Stat Card */}
          <div className="rounded-2xl border border-[#e8eaf0] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#858a98]">Assigned Workload</p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Briefcase size={16} />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-[#1f2438]">
                {selectedFaculty ? selectedFaculty.weekly_workload : facultySchedule.length}{" "}
                <span className="text-sm font-normal text-[#8a8f9d]">periods/week</span>
              </p>
              <p className="mt-1 text-[11px] text-[#9a9eaa]">
                Derived directly from backend course offerings database.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#edf0f5] pt-3 text-xs text-[#555b69]">
              <span>Active Scheduled:</span>
              <span className="font-semibold text-[#1f2438]">
                {facultySchedule.length} session(s)
              </span>
            </div>
          </div>
        </div>

        {/* Timetable Grid */}
        <TimetableGrid
          schedule={facultySchedule}
          title={selectedFaculty ? `${selectedFaculty.name} Teaching Schedule` : "Teaching Schedule"}
          subtitle={`Department of ${selectedFaculty?.department || "University"} · Working Hours: ${workingHours}`}
          workingHours={workingHours}
          readOnly={true}
          emptyMessage="No teaching sessions scheduled for this faculty member."
        />
      </div>
    </PortalShell>
  );
}
