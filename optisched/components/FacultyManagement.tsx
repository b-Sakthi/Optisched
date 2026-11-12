"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  X,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPTISCHED_API_URL ?? "http://127.0.0.1:8000";

type SubjectQualification = {
  subject_id: number;
  code: string;
  name: string;
  department: string;
};

type FacultyMember = {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  is_active: boolean;
  weekly_workload: number;
  qualifications: SubjectQualification[];
};

type Subject = {
  id: number;
  code: string;
  name: string;
  department: string;
};

export function FacultyManagement() {
  const { getToken } = useAuth();

  const [facultyList, setFacultyList] = useState<FacultyMember[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [workloadFilter, setWorkloadFilter] = useState<"all" | "active" | "unassigned">("all");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<FacultyMember | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formDepartment, setFormDepartment] = useState("Computer Science");
  const [formSelectedSubjects, setFormSelectedSubjects] = useState<number[]>([]);

  // Qualification Drawer/Modal
  const [managingQualsFaculty, setManagingQualsFaculty] = useState<FacultyMember | null>(null);

  // Load Data
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [facRes, subRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/faculty`),
        fetch(`${API_BASE_URL}/api/subjects`),
      ]);

      if (!facRes.ok) throw new Error(`Failed to load faculty (${facRes.status})`);
      if (!subRes.ok) throw new Error(`Failed to load subjects (${subRes.status})`);

      const facData: FacultyMember[] = await facRes.json();
      const subData: Subject[] = await subRes.json();

      setFacultyList(facData);
      setAllSubjects(subData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error connecting to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [facRes, subRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/faculty`),
          fetch(`${API_BASE_URL}/api/subjects`),
        ]);

        if (!facRes.ok) throw new Error(`Failed to load faculty (${facRes.status})`);
        if (!subRes.ok) throw new Error(`Failed to load subjects (${subRes.status})`);

        const facData: FacultyMember[] = await facRes.json();
        const subData: Subject[] = await subRes.json();

        if (active) {
          setFacultyList(facData);
          setAllSubjects(subData);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Error connecting to backend");
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

  // Filtered Faculty List
  const filteredFaculty = useMemo(() => {
    return facultyList.filter((fac) => {
      // Search
      const q = search.toLowerCase();
      const matchesSearch =
        fac.name.toLowerCase().includes(q) ||
        fac.employee_id.toLowerCase().includes(q) ||
        fac.email.toLowerCase().includes(q) ||
        fac.qualifications.some((sub) =>
          sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q)
        );

      if (!matchesSearch) return false;

      // Department filter
      if (departmentFilter !== "all" && fac.department !== departmentFilter) {
        return false;
      }

      // Workload filter
      if (workloadFilter === "active" && fac.weekly_workload === 0) return false;
      if (workloadFilter === "unassigned" && fac.weekly_workload > 0) return false;

      // Subject filter
      if (selectedSubjectFilter !== "all") {
        const subId = Number(selectedSubjectFilter);
        if (!fac.qualifications.some((q) => q.subject_id === subId)) return false;
      }

      return true;
    });
  }, [facultyList, search, departmentFilter, workloadFilter, selectedSubjectFilter]);

  // Open Edit Modal
  const openEditModal = (fac: FacultyMember) => {
    setEditingFaculty(fac);
    setFormEmployeeId(fac.employee_id);
    setFormName(fac.name);
    setFormEmail(fac.email);
    setFormDepartment(fac.department);
    setShowAddModal(true);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingFaculty(null);
    setFormEmployeeId(`FAC-CS-0${facultyList.length + 1}`.padStart(10, "0"));
    setFormName("");
    setFormEmail("");
    setFormDepartment("Computer Science");
    setFormSelectedSubjects([]);
    setShowAddModal(true);
  };

  // Save Faculty (Create or Edit)
  const handleSaveFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      if (editingFaculty) {
        // Edit
        const res = await fetch(`${API_BASE_URL}/api/faculty/${editingFaculty.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            name: formName,
            email: formEmail,
            department: formDepartment,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.detail || `Failed to update faculty (${res.status})`);
        }
        setSuccess(`Faculty '${formName}' updated successfully.`);
      } else {
        // Create
        const res = await fetch(`${API_BASE_URL}/api/faculty`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            employee_id: formEmployeeId,
            name: formName,
            email: formEmail,
            department: formDepartment,
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.detail || `Failed to create faculty (${res.status})`);
        }

        // If subjects were selected, assign them
        if (formSelectedSubjects.length > 0 && body?.id) {
          const newFacId = body.id;
          for (const sId of formSelectedSubjects) {
            await fetch(`${API_BASE_URL}/api/faculty/${newFacId}/qualifications`, {
              method: "POST",
              headers,
              body: JSON.stringify({ subject_id: sId }),
            });
          }
        }
        setSuccess(`Faculty '${formName}' created successfully.`);
      }

      setShowAddModal(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving faculty");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Faculty
  const handleDeleteFaculty = async (fac: FacultyMember) => {
    if (!confirm(`Are you sure you want to delete ${fac.name} (${fac.employee_id})?`)) {
      return;
    }

    setError("");
    setSuccess("");
    try {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/faculty/${fac.id}`, {
        method: "DELETE",
        headers,
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.detail || `Cannot delete faculty (${res.status})`);
      }

      setSuccess(`Faculty '${fac.name}' deleted successfully.`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deleting faculty");
    }
  };

  // Assign Subject Qualification
  const handleAddQualification = async (subjectId: number) => {
    if (!managingQualsFaculty) return;
    try {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/faculty/${managingQualsFaculty.id}/qualifications`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ subject_id: subjectId }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Could not assign qualification");
      }
      await fetchData();
      // Update local managingQualsFaculty
      const updated = facultyList.find((f) => f.id === managingQualsFaculty.id);
      if (updated) setManagingQualsFaculty(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign qualification");
    }
  };

  // Remove Subject Qualification
  const handleRemoveQualification = async (subjectId: number) => {
    if (!managingQualsFaculty) return;
    try {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/faculty/${managingQualsFaculty.id}/qualifications/${subjectId}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail || "Could not remove qualification");
      }
      await fetchData();
      const updated = facultyList.find((f) => f.id === managingQualsFaculty.id);
      if (updated) setManagingQualsFaculty(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove qualification");
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="flex items-start justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-600" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Top Controls Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#20242c]">
            Faculty Management
          </h2>
          <p className="text-xs text-[#747989]">
            Manage academic instructors, course qualifications, and assigned weekly workloads.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-[#e5e7ee] bg-white px-3 py-2 text-xs font-semibold text-[#454c80] transition hover:bg-[#f7f8fa]"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-xl bg-[#343956] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#464d70]"
          >
            <Plus size={15} />
            Add Faculty
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e8eaf0] bg-white p-4">
        {/* Search */}
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#e7e9ef] px-3 py-2">
          <Search size={15} className="text-[#9a9eaa]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, email, or subject..."
            className="w-full bg-transparent text-xs outline-none placeholder:text-[#a5a8b2]"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#8a8f9d]">Department:</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-xl border border-[#e7e9ef] bg-white px-3 py-2 text-xs font-medium text-[#454c80] outline-none"
          >
            <option value="all">All Departments</option>
            <option value="Computer Science">Computer Science</option>
          </select>
        </div>

        {/* Workload Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#8a8f9d]">Workload:</span>
          <select
            value={workloadFilter}
            onChange={(e) => setWorkloadFilter(e.target.value as "all" | "active" | "unassigned")}
            className="rounded-xl border border-[#e7e9ef] bg-white px-3 py-2 text-xs font-medium text-[#454c80] outline-none"
          >
            <option value="all">All Workloads</option>
            <option value="active">Active Teaching (&gt;0 hrs)</option>
            <option value="unassigned">Unassigned (0 hrs)</option>
          </select>
        </div>

        {/* Subject Expertise Filter */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#8a8f9d]">Expertise:</span>
          <select
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
            className="max-w-[200px] truncate rounded-xl border border-[#e7e9ef] bg-white px-3 py-2 text-xs font-medium text-[#454c80] outline-none"
          >
            <option value="all">All Subjects ({allSubjects.length})</option>
            {allSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Faculty Table */}
      <div className="overflow-hidden rounded-2xl border border-[#e8eaf0] bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-[#8a8f9d]">
            <RefreshCw size={18} className="mr-2 animate-spin text-[#454c80]" />
            Loading faculty directory...
          </div>
        ) : filteredFaculty.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={32} className="text-[#cbd0dd]" />
            <h3 className="mt-3 text-sm font-semibold text-[#20242c]">No faculty members found</h3>
            <p className="mt-1 text-xs text-[#8a8f9d]">
              Try adjusting your search query or filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#eceef4] bg-[#fafbfe] text-[11px] font-semibold text-[#8a8f9d]">
                  <th className="px-5 py-3.5">Faculty Member</th>
                  <th className="px-4 py-3.5">Employee ID</th>
                  <th className="px-4 py-3.5">Department</th>
                  <th className="px-4 py-3.5">Qualified Subjects</th>
                  <th className="px-4 py-3.5">Weekly Workload</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f2f7]">
                {filteredFaculty.map((fac) => (
                  <tr key={fac.id} className="transition hover:bg-[#fafbfe]">
                    {/* Name & Email */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eff1f9] font-bold text-[#454c80]">
                          {fac.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-[#20242c]">{fac.name}</div>
                          <div className="text-[11px] text-[#8a8f9d]">{fac.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Employee ID */}
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[#4a5068]">
                      {fac.employee_id}
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3.5 text-[#4a5068]">
                      <span className="rounded-md bg-[#f0f1f8] px-2 py-1 text-[11px] font-medium text-[#454c80]">
                        {fac.department}
                      </span>
                    </td>

                    {/* Qualifications */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {fac.qualifications.slice(0, 3).map((q) => (
                          <span
                            key={q.subject_id}
                            title={`${q.code}: ${q.name}`}
                            className="rounded-md border border-[#e5e7f0] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#49506e]"
                          >
                            {q.code}
                          </span>
                        ))}
                        {fac.qualifications.length > 3 && (
                          <button
                            onClick={() => setManagingQualsFaculty(fac)}
                            className="rounded-md bg-[#f0f2f9] px-1.5 py-0.5 text-[10px] font-semibold text-[#454c80] hover:underline"
                          >
                            +{fac.qualifications.length - 3} more
                          </button>
                        )}
                        {fac.qualifications.length === 0 && (
                          <span className="text-[11px] italic text-[#a3a7b5]">None</span>
                        )}
                      </div>
                    </td>

                    {/* Workload */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            fac.weekly_workload > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {fac.weekly_workload} hrs/wk
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setManagingQualsFaculty(fac)}
                          title="Manage Subject Qualifications"
                          className="rounded-lg p-1.5 text-[#6c7285] transition hover:bg-[#f0f1f8] hover:text-[#454c80]"
                        >
                          <BookOpen size={15} />
                        </button>
                        <button
                          onClick={() => openEditModal(fac)}
                          title="Edit Faculty"
                          className="rounded-lg p-1.5 text-[#6c7285] transition hover:bg-[#f0f1f8] hover:text-[#454c80]"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => void handleDeleteFaculty(fac)}
                          title={
                            fac.weekly_workload > 0
                              ? "Cannot delete faculty assigned to course offerings"
                              : "Delete Faculty"
                          }
                          className={cn(
                            "rounded-lg p-1.5 transition",
                            fac.weekly_workload > 0
                              ? "cursor-not-allowed text-[#c4c7d4]"
                              : "text-[#6c7285] hover:bg-rose-50 hover:text-rose-600",
                          )}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Faculty Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#f0f2f7] pb-3">
              <h3 className="text-base font-bold text-[#20242c]">
                {editingFaculty ? "Edit Faculty Details" : "Add New Faculty Member"}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#8a8f9d] hover:text-black">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveFaculty} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52576b]">
                  Employee ID
                </label>
                <input
                  required
                  disabled={Boolean(editingFaculty)}
                  value={formEmployeeId}
                  onChange={(e) => setFormEmployeeId(e.target.value)}
                  placeholder="e.g. FAC-CS-041"
                  className="w-full rounded-xl border border-[#e2e4ed] px-3 py-2 text-xs outline-none disabled:bg-[#f7f8fa] disabled:text-[#8a8f9d]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52576b]">
                  Full Name
                </label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Dr. Robert Langdon"
                  className="w-full rounded-xl border border-[#e2e4ed] px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52576b]">
                  Email Address
                </label>
                <input
                  required
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="e.g. r.langdon@optisched.edu"
                  className="w-full rounded-xl border border-[#e2e4ed] px-3 py-2 text-xs outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[#52576b]">
                  Department
                </label>
                <input
                  required
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="w-full rounded-xl border border-[#e2e4ed] px-3 py-2 text-xs outline-none"
                />
              </div>

              {!editingFaculty && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#52576b]">
                    Initial Qualifications
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-[#e2e4ed] p-2 space-y-1">
                    {allSubjects.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-xs text-[#454c80] hover:bg-[#fafbfe] p-1 rounded-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formSelectedSubjects.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormSelectedSubjects([...formSelectedSubjects, s.id]);
                            } else {
                              setFormSelectedSubjects(formSelectedSubjects.filter((id) => id !== s.id));
                            }
                          }}
                        />
                        <span>[{s.code}] {s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-[#e2e4ed] px-4 py-2 text-xs font-semibold text-[#5a6074] hover:bg-[#f7f8fa]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#343956] px-4 py-2 text-xs font-semibold text-white hover:bg-[#464d70] disabled:opacity-60"
                >
                  {submitting ? "Saving..." : editingFaculty ? "Update Faculty" : "Add Faculty"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Qualifications Modal */}
      {managingQualsFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#f0f2f7] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#20242c]">
                  Subject Qualifications
                </h3>
                <p className="text-xs text-[#747989]">
                  {managingQualsFaculty.name} ({managingQualsFaculty.employee_id})
                </p>
              </div>
              <button
                onClick={() => setManagingQualsFaculty(null)}
                className="text-[#8a8f9d] hover:text-black"
              >
                <X size={18} />
              </button>
            </div>

            {/* Currently Qualified Subjects */}
            <div className="mb-5 space-y-2">
              <h4 className="text-xs font-semibold text-[#52576b]">
                Currently Qualified ({managingQualsFaculty.qualifications.length})
              </h4>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-[#f0f1f8] bg-[#fbfcfd] p-3">
                {managingQualsFaculty.qualifications.length === 0 ? (
                  <p className="text-xs italic text-[#a0a5b5]">No subjects mapped yet.</p>
                ) : (
                  managingQualsFaculty.qualifications.map((q) => (
                    <span
                      key={q.subject_id}
                      className="flex items-center gap-1.5 rounded-lg border border-[#e2e5ef] bg-white px-2.5 py-1 text-xs text-[#3b415a]"
                    >
                      <span className="font-semibold">{q.code}</span> - {q.name}
                      <button
                        onClick={() => void handleRemoveQualification(q.subject_id)}
                        className="text-[#9ea3b5] hover:text-rose-600"
                        title="Remove Qualification"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Add More Subjects */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#52576b]">Add Available Subject</h4>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[#e8eaf0] divide-y divide-[#f0f1f8]">
                {allSubjects
                  .filter(
                    (s) =>
                      !managingQualsFaculty.qualifications.some(
                        (q) => q.subject_id === s.id,
                      ),
                  )
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 hover:bg-[#fafbfe]"
                    >
                      <div className="text-xs">
                        <span className="font-semibold text-[#454c80]">{s.code}</span>: {s.name}
                      </div>
                      <button
                        onClick={() => void handleAddQualification(s.id)}
                        className="rounded-lg bg-[#f0f2f9] px-2 py-1 text-[11px] font-semibold text-[#454c80] transition hover:bg-[#343956] hover:text-white"
                      >
                        + Add
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setManagingQualsFaculty(null)}
                className="rounded-xl bg-[#343956] px-4 py-2 text-xs font-semibold text-white hover:bg-[#464d70]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
