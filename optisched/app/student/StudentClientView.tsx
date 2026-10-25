"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Search,
  BookOpen,
  Filter,
  UserCheck,
  ChevronDown,
  Download,
  AlertCircle,
  Building,
} from "lucide-react";
import { PortalShell } from "@/components/PortalShell";
import { TimetableGrid } from "@/components/TimetableGrid";
import { API_BASE_URL, fetchWithAuth, toUiEntry } from "@/lib/api";
import { Section, FacultyMember, ScheduleEntry, GenerateResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function StudentClientView({
  userName,
  userEmail,
  userRole,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState("all");

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [workingHours, setWorkingHours] = useState("09:00-16:00");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [secRes, facRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
        ]);

        if (secRes.ok) {
          const secData: Section[] = await secRes.json();
          const activeSecs = secData.filter((s) => s.is_active);
          setSections(activeSecs);
          if (activeSecs.length > 0) {
            setSelectedSectionId(String(activeSecs[0].id));
            // Fetch published schedule for this section
            loadTimetable(activeSecs[0].id);
          }
        }
        if (facRes.ok) {
          const facData: FacultyMember[] = await facRes.json();
          setFacultyList(facData);
        }
      } catch (e) {
        setError("Could not connect to university schedule service.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  async function loadTimetable(sectionId: number) {
    try {
      // In student view, we fetch the schedule for the section
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
      title="Student Timetable Portal"
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
        {/* Controls & Section Selector */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e8eaf0] bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Published Timetable (Read-Only)</span>
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-[#1f2438]">
              {selectedSection ? `${selectedSection.name} Class Schedule` : "Your Class Schedule"}
            </h2>
            <p className="mt-0.5 text-xs text-[#8a8f9d]">
              {selectedSection
                ? `Department of ${selectedSection.department} · Year ${selectedSection.academic_year} · Semester ${selectedSection.semester}`
                : "Select your registered academic section below."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-[#e3e5ec] bg-[#f9fafc] px-3 py-2 text-xs">
              <span className="text-[#999eaa]">My Section:</span>
              <select
                value={selectedSectionId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSectionId(id);
                  if (id) loadTimetable(Number(id));
                }}
                className="bg-transparent font-semibold outline-none"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Sem {s.semester})
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="text-[#8d92a0]" />
            </label>

            {/* Faculty Lookup Filter */}
            <label className="flex items-center gap-2 rounded-xl border border-[#e3e5ec] bg-[#f9fafc] px-3 py-2 text-xs">
              <UserCheck size={13} className="text-[#999eaa]" />
              <select
                value={selectedFacultyFilter}
                onChange={(e) => setSelectedFacultyFilter(e.target.value)}
                className="bg-transparent text-xs font-medium outline-none"
              >
                <option value="all">All Faculty</option>
                {facultyList.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="text-[#8d92a0]" />
            </label>
          </div>
        </div>

        {/* Timetable Grid Viewer */}
        <TimetableGrid
          schedule={filteredSchedule}
          title={selectedSection ? `${selectedSection.name} Weekly Timetable` : "Weekly Timetable"}
          subtitle={
            selectedSection
              ? `Semester ${selectedSection.semester} · Working Hours: ${workingHours}`
              : undefined
          }
          workingHours={workingHours}
          readOnly={true}
          emptyMessage="No classes scheduled for the selected section."
        />
      </div>
    </PortalShell>
  );
}
