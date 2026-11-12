"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  BookOpen,
  Building,
  GraduationCap,
  Layers,
  Plus,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/api";
import { Section, Subject, Room, CourseOffering, FacultyMember } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CurriculumManagement() {
  const { getToken } = useAuth();
  const [subTab, setSubTab] = useState<"sections" | "subjects" | "rooms" | "offerings">("sections");

  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [offerings, setOfferings] = useState<CourseOffering[]>([]);
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  // Modal forms
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [secName, setSecName] = useState("");
  const [secDept, setSecDept] = useState("Computer Science");
  const [secYear, setSecYear] = useState(2);
  const [secSem, setSecSem] = useState(4);

  const [subCode, setSubCode] = useState("");
  const [subName, setSubName] = useState("");
  const [subDept, setSubDept] = useState("Computer Science");

  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("classroom");
  const [roomCapacity, setRoomCapacity] = useState(60);
  const [roomBuilding, setRoomBuilding] = useState("Academic Block");

  const [offClassId, setOffClassId] = useState("");
  const [offSubjectId, setOffSubjectId] = useState("");
  const [offFacultyId, setOffFacultyId] = useState("");
  const [offPeriods, setOffPeriods] = useState(4);
  const [offLab, setOffLab] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [secRes, subRes, roomRes, offRes, facRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/api/sections`),
        fetchWithAuth(`${API_BASE_URL}/api/subjects`),
        fetchWithAuth(`${API_BASE_URL}/api/rooms`),
        fetchWithAuth(`${API_BASE_URL}/api/course-offerings`),
        fetchWithAuth(`${API_BASE_URL}/api/faculty`),
      ]);

      if (secRes.ok) setSections(await secRes.json());
      if (subRes.ok) setSubjects(await subRes.json());
      if (roomRes.ok) setRooms(await roomRes.json());
      if (offRes.ok) setOfferings(await offRes.json());
      if (facRes.ok) setFaculty(await facRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error connecting to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [secRes, subRes, roomRes, offRes, facRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/api/sections`),
          fetchWithAuth(`${API_BASE_URL}/api/subjects`),
          fetchWithAuth(`${API_BASE_URL}/api/rooms`),
          fetchWithAuth(`${API_BASE_URL}/api/course-offerings`),
          fetchWithAuth(`${API_BASE_URL}/api/faculty`),
        ]);

        if (active) {
          if (secRes.ok) setSections(await secRes.json());
          if (subRes.ok) setSubjects(await subRes.json());
          if (roomRes.ok) setRooms(await roomRes.json());
          if (offRes.ok) setOfferings(await offRes.json());
          if (facRes.ok) setFaculty(await facRes.json());
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Error connecting to backend");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (subTab === "sections") {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/api/sections`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: secName,
              department: secDept,
              academic_year: Number(secYear),
              semester: Number(secSem),
            }),
          },
          getToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create section");
        setNotice(`Section ${secName} created successfully.`);
        setSecName("");
      } else if (subTab === "subjects") {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/api/subjects`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: subCode,
              name: subName,
              department: subDept,
            }),
          },
          getToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create subject");
        setNotice(`Subject ${subCode} created successfully.`);
        setSubCode("");
        setSubName("");
      } else if (subTab === "rooms") {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/api/rooms`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: roomName,
              room_type: roomType,
              capacity: Number(roomCapacity),
              building: roomBuilding,
            }),
          },
          getToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to create room");
        setNotice(`Room ${roomName} created successfully.`);
        setRoomName("");
      } else if (subTab === "offerings") {
        const res = await fetchWithAuth(
          `${API_BASE_URL}/api/course-offerings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              class_id: Number(offClassId),
              subject_id: Number(offSubjectId),
              faculty_id: Number(offFacultyId),
              weekly_periods: Number(offPeriods),
              requires_lab: offLab,
            }),
          },
          getToken
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to assign course offering");
        setNotice("Course offering created and assigned successfully.");
      }

      setShowModal(false);
      void loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {notice}
          </span>
          <button onClick={() => setNotice("")}><X size={14} /></button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <span className="flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </span>
          <button onClick={() => setError("")}><X size={14} /></button>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e5e7ee] pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSubTab("sections")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
              subTab === "sections" ? "bg-[#343956] text-white" : "bg-white text-[#747989] border border-[#e5e7ee]"
            )}
          >
            <GraduationCap size={15} /> Sections ({sections.length})
          </button>
          <button
            onClick={() => setSubTab("subjects")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
              subTab === "subjects" ? "bg-[#343956] text-white" : "bg-white text-[#747989] border border-[#e5e7ee]"
            )}
          >
            <BookOpen size={15} /> Subjects ({subjects.length})
          </button>
          <button
            onClick={() => setSubTab("rooms")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
              subTab === "rooms" ? "bg-[#343956] text-white" : "bg-white text-[#747989] border border-[#e5e7ee]"
            )}
          >
            <Building size={15} /> Rooms ({rooms.length})
          </button>
          <button
            onClick={() => setSubTab("offerings")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition",
              subTab === "offerings" ? "bg-[#343956] text-white" : "bg-white text-[#747989] border border-[#e5e7ee]"
            )}
          >
            <Layers size={15} /> Course Offerings ({offerings.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[#e5e7ee] bg-white px-3 py-2 text-xs">
            <Search size={14} className="text-[#9a9eaa]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-32 bg-transparent outline-none placeholder:text-[#a5a8b2]"
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#343956] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#464d70]"
          >
            <Plus size={15} /> Add {subTab.slice(0, -1)}
          </button>
        </div>
      </div>

      {/* Tables based on active subTab */}
      {subTab === "sections" && (
        <div className="overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#eceef3] bg-[#fafafc] text-[10px] uppercase tracking-wider text-[#8a8f9d]">
              <tr>
                <th className="px-5 py-3">Section Name</th>
                <th className="px-5 py-3">Department</th>
                <th className="px-5 py-3">Year / Semester</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f4]">
              {sections
                .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.department.toLowerCase().includes(search.toLowerCase()))
                .map((sec) => (
                  <tr key={sec.id} className="hover:bg-[#fafafc]">
                    <td className="px-5 py-3.5 font-semibold text-[#20242c]">{sec.name}</td>
                    <td className="px-5 py-3.5 text-[#555b69]">{sec.department}</td>
                    <td className="px-5 py-3.5 text-[#555b69]">Year {sec.academic_year} · Semester {sec.semester}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold", sec.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", sec.is_active ? "bg-emerald-500" : "bg-zinc-400")} />
                        {sec.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "subjects" && (
        <div className="overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#eceef3] bg-[#fafafc] text-[10px] uppercase tracking-wider text-[#8a8f9d]">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Subject Name</th>
                <th className="px-5 py-3">Department</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f4]">
              {subjects
                .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))
                .map((sub) => (
                  <tr key={sub.id} className="hover:bg-[#fafafc]">
                    <td className="px-5 py-3.5 font-mono font-bold text-[#454c80]">{sub.code}</td>
                    <td className="px-5 py-3.5 font-medium text-[#20242c]">{sub.name}</td>
                    <td className="px-5 py-3.5 text-[#555b69]">{sub.department}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "rooms" && (
        <div className="overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#eceef3] bg-[#fafafc] text-[10px] uppercase tracking-wider text-[#8a8f9d]">
              <tr>
                <th className="px-5 py-3">Room Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Capacity</th>
                <th className="px-5 py-3">Building</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f4]">
              {rooms
                .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
                .map((r) => (
                  <tr key={r.id} className="hover:bg-[#fafafc]">
                    <td className="px-5 py-3.5 font-semibold text-[#20242c]">{r.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase", r.room_type === "lab" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-blue-50 text-blue-800 border border-blue-200")}>
                        {r.room_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#555b69]">{r.capacity} seats</td>
                    <td className="px-5 py-3.5 text-[#555b69]">{r.building || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "offerings" && (
        <div className="overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#eceef3] bg-[#fafafc] text-[10px] uppercase tracking-wider text-[#8a8f9d]">
              <tr>
                <th className="px-5 py-3">Section</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Faculty</th>
                <th className="px-5 py-3">Weekly Periods</th>
                <th className="px-5 py-3">Lab Req</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0f4]">
              {offerings.map((o) => {
                const sec = sections.find((s) => s.id === o.class_id);
                const sub = subjects.find((s) => s.id === o.subject_id);
                const fac = faculty.find((f) => f.id === o.faculty_id);
                return (
                  <tr key={o.id} className="hover:bg-[#fafafc]">
                    <td className="px-5 py-3.5 font-semibold text-[#20242c]">{sec?.name || `Section ${o.class_id}`}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-[#454c80]">{sub?.code}</span>: {sub?.name}
                    </td>
                    <td className="px-5 py-3.5 text-[#555b69]">{fac?.name || `Faculty ${o.faculty_id}`}</td>
                    <td className="px-5 py-3.5 font-semibold">{o.weekly_periods} periods/wk</td>
                    <td className="px-5 py-3.5">
                      <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-semibold", o.requires_lab ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700")}>
                        {o.requires_lab ? "Yes (Lab)" : "Theory"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1f2438]">Add New {subTab.slice(0, -1)}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {subTab === "sections" && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Section Name</label>
                    <input required value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="e.g. CSE-A" className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Department</label>
                    <input required value={secDept} onChange={(e) => setSecDept(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#555b69]">Academic Year</label>
                      <input type="number" min={1} max={4} value={secYear} onChange={(e) => setSecYear(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#555b69]">Semester</label>
                      <input type="number" min={1} max={8} value={secSem} onChange={(e) => setSecSem(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                    </div>
                  </div>
                </>
              )}

              {subTab === "subjects" && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Subject Code</label>
                    <input required value={subCode} onChange={(e) => setSubCode(e.target.value)} placeholder="e.g. CS201" className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Subject Name</label>
                    <input required value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Operating Systems" className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Department</label>
                    <input required value={subDept} onChange={(e) => setSubDept(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                </>
              )}

              {subTab === "rooms" && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Room Name</label>
                    <input required value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Room 301 / Lab 1" className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Room Type</label>
                    <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none">
                      <option value="classroom">Classroom</option>
                      <option value="lab">Lab</option>
                      <option value="lecture_hall">Lecture Hall</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#555b69]">Capacity</label>
                      <input type="number" min={1} value={roomCapacity} onChange={(e) => setRoomCapacity(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#555b69]">Building</label>
                      <input value={roomBuilding} onChange={(e) => setRoomBuilding(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                    </div>
                  </div>
                </>
              )}

              {subTab === "offerings" && (
                <>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Select Section</label>
                    <select required value={offClassId} onChange={(e) => setOffClassId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none">
                      <option value="">Select a section...</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} (Sem {s.semester})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Select Subject</label>
                    <select required value={offSubjectId} onChange={(e) => setOffSubjectId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none">
                      <option value="">Select a subject...</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#555b69]">Assigned Faculty</label>
                    <select required value={offFacultyId} onChange={(e) => setOffFacultyId(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none">
                      <option value="">Select qualified faculty...</option>
                      {faculty.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.department})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#555b69]">Weekly Periods</label>
                      <input type="number" min={1} max={30} value={offPeriods} onChange={(e) => setOffPeriods(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-[#e5e7ee] p-2.5 text-xs outline-none" />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <input type="checkbox" id="offLab" checked={offLab} onChange={(e) => setOffLab(e.target.checked)} className="h-4 w-4 rounded" />
                      <label htmlFor="offLab" className="text-xs font-semibold text-[#555b69]">Requires Lab</label>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-[#edf0f5]">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl border border-[#e5e7ee] px-4 py-2 text-xs font-semibold text-[#747989]">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="rounded-xl bg-[#343956] px-4 py-2 text-xs font-semibold text-white hover:bg-[#464d70] disabled:opacity-50">
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
