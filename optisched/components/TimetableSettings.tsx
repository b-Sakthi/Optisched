"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Check,
  AlertCircle,
  Coffee,
  Sparkles,
  Layers,
  Copy,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";

export type TimeSlot = {
  name: string;
  start_time: string;
  end_time: string;
};

export type DaySchedule = {
  day: string;
  is_half_day: boolean;
  slots: TimeSlot[];
};

export type BreakItem = {
  name: string;
  start_time: string;
  end_time: string;
  duration?: number | null;
  is_lunch: boolean;
};

export type SemesterConfig = {
  id?: number;
  semester: number;
  days: DaySchedule[];
  working_hours_start?: string | null;
  working_hours_end?: string | null;
  working_hours?: string;
  period_duration?: number | null;
  transition_duration?: number | null;
  breaks?: BreakItem[];
  lunch_break?: BreakItem | null;
  is_active: boolean;
  configured: boolean;
};

const ALL_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPTISCHED_API_URL ?? "http://127.0.0.1:8000";

import { cn, toMinutes, fromMinutes } from "@/lib/utils";

export function TimetableSettings({
  initialSemester = 1,
  onConfigSaved,
}: {
  initialSemester?: number;
  onConfigSaved?: (semester: number) => void;
}) {
  const { getToken } = useAuth();
  const [selectedSemester, setSelectedSemester] = useState(initialSemester);
  const [savedConfigsList, setSavedConfigsList] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);

  // Editable Form State
  const [workingStart, setWorkingStart] = useState("09:00");
  const [workingEnd, setWorkingEnd] = useState("16:00");
  const [periodDuration, setPeriodDuration] = useState(50);
  const [transitionDuration, setTransitionDuration] = useState(5);
  const [days, setDays] = useState<DaySchedule[]>([]);
  const [breaks, setBreaks] = useState<BreakItem[]>([]);
  const [activeTabDay, setActiveTabDay] = useState("Monday");

  // Keep original state snapshot to track unsaved changes
  const [originalSnapshot, setOriginalSnapshot] = useState("");

  const currentSnapshot = useMemo(() => {
    return JSON.stringify({
      workingStart,
      workingEnd,
      periodDuration,
      transitionDuration,
      days,
      breaks,
    });
  }, [workingStart, workingEnd, periodDuration, transitionDuration, days, breaks]);

  const hasUnsavedChanges = useMemo(() => {
    return originalSnapshot !== "" && originalSnapshot !== currentSnapshot;
  }, [originalSnapshot, currentSnapshot]);

  // Keep selected semester in sync with prop using React state adjustment
  const [prevInitial, setPrevInitial] = useState(initialSemester);
  if (initialSemester !== prevInitial) {
    setPrevInitial(initialSemester);
    if (initialSemester && initialSemester >= 1 && initialSemester <= 8) {
      setSelectedSemester(initialSemester);
    }
  }

  // Load configured semesters on mount
  useEffect(() => {
    async function loadConfigurationsList() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/timetable/configurations`);
        if (res.ok) {
          const list: SemesterConfig[] = await res.json();
          setSavedConfigsList(list.map((c) => c.semester));
        }
      } catch {
        // Silently handle list loading failure
      }
    }
    void loadConfigurationsList();
  }, []);

  // Load config when semester changes
  useEffect(() => {
    let active = true;

    async function loadSemesterConfig() {
      setLoading(true);
      setError("");
      setSuccess("");

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/timetable/configurations/${selectedSemester}`,
        );
        if (!res.ok) {
          throw new Error(
            `Could not load configuration for Semester ${selectedSemester}.`,
          );
        }
        const data: SemesterConfig = await res.json();
        if (!active) return;

        setIsConfigured(Boolean(data.configured));
        setWorkingStart(data.working_hours_start || "09:00");
        setWorkingEnd(data.working_hours_end || "16:00");
        setPeriodDuration(data.period_duration || 50);
        setTransitionDuration(
          data.transition_duration !== undefined && data.transition_duration !== null
            ? data.transition_duration
            : 5,
        );

        const loadedDays = data.days || [];
        setDays(loadedDays);
        if (loadedDays.length > 0) {
          setActiveTabDay(loadedDays[0].day);
        }

        const loadedBreaks = [
          ...(data.breaks || []),
          ...(data.lunch_break && !data.breaks?.some((b) => b.is_lunch)
            ? [data.lunch_break]
            : []),
        ];
        setBreaks(loadedBreaks);

        const snap = JSON.stringify({
          workingStart: data.working_hours_start || "09:00",
          workingEnd: data.working_hours_end || "16:00",
          periodDuration: data.period_duration || 50,
          transitionDuration:
            data.transition_duration !== undefined && data.transition_duration !== null
              ? data.transition_duration
              : 5,
          days: loadedDays,
          breaks: loadedBreaks,
        });
        setOriginalSnapshot(snap);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load semester configuration.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSemesterConfig();

    return () => {
      active = false;
    };
  }, [selectedSemester]);

  // Handler: Change Weekday Membership
  function toggleWeekday(weekday: string) {
    setError("");
    const exists = days.some((d) => d.day === weekday);
    if (exists) {
      if (days.length <= 1) {
        setError("At least one weekday must be enabled.");
        return;
      }
      const updated = days.filter((d) => d.day !== weekday);
      setDays(updated);
      if (activeTabDay === weekday) {
        setActiveTabDay(updated[0]?.day || "Monday");
      }
    } else {
      // Add day by copying periods from existing day or generating defaults
      const templateSlots = days[0]?.slots?.length
        ? days[0].slots.map((s) => ({ ...s }))
        : [
            { name: "Period 1", start_time: "09:00", end_time: "09:50" },
            { name: "Period 2", start_time: "09:55", end_time: "10:45" },
            { name: "Period 3", start_time: "11:00", end_time: "11:50" },
            { name: "Period 4", start_time: "11:55", end_time: "12:45" },
          ];

      const newDay: DaySchedule = {
        day: weekday,
        is_half_day: weekday === "Saturday",
        slots: templateSlots,
      };

      // Keep weekdays in chronological order
      const dayRank = (d: string) => ALL_WEEKDAYS.indexOf(d);
      const updated = [...days, newDay].sort((a, b) => dayRank(a.day) - dayRank(b.day));
      setDays(updated);
      setActiveTabDay(weekday);
    }
  }

  // Handler: Toggle Half-Day for a specific day
  function toggleHalfDay(dayName: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayName) return d;
        const nextHalf = !d.is_half_day;
        // If becoming half day, keep first 4 slots by default if > 4
        let newSlots = [...d.slots];
        if (nextHalf && newSlots.length > 4) {
          newSlots = newSlots.slice(0, 4);
        }
        return {
          ...d,
          is_half_day: nextHalf,
          slots: newSlots,
        };
      }),
    );
  }

  // Handler: Update slot inside a day
  function updateSlot(
    dayName: string,
    slotIndex: number,
    field: keyof TimeSlot,
    value: string,
  ) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayName) return d;
        const newSlots = d.slots.map((s, idx) => {
          if (idx !== slotIndex) return s;
          return { ...s, [field]: value };
        });
        return { ...d, slots: newSlots };
      }),
    );
  }

  // Handler: Add slot to day
  function addSlotToDay(dayName: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayName) return d;
        const lastSlot = d.slots[d.slots.length - 1];
        let newStart = "13:30";
        let newEnd = "14:20";

        if (lastSlot) {
          const lastEndMin = toMinutes(lastSlot.end_time);
          const nextStartMin = lastEndMin + transitionDuration;
          newStart = fromMinutes(nextStartMin);
          newEnd = fromMinutes(nextStartMin + periodDuration);
        }

        const nextNum = d.slots.length + 1;
        const newSlots = [
          ...d.slots,
          {
            name: `Period ${nextNum}`,
            start_time: newStart,
            end_time: newEnd,
          },
        ];
        return { ...d, slots: newSlots };
      }),
    );
  }

  // Handler: Remove slot from day
  function removeSlotFromDay(dayName: string, slotIndex: number) {
    setError("");
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayName) return d;
        if (d.slots.length <= 1) {
          setError(`Day ${dayName} must retain at least one teaching period.`);
          return d;
        }
        const newSlots = d.slots
          .filter((_, idx) => idx !== slotIndex)
          .map((s, idx) => ({
            ...s,
            name: `Period ${idx + 1}`,
          }));
        return { ...d, slots: newSlots };
      }),
    );
  }

  // Handler: Copy current day slots to all weekdays
  function copyScheduleToAllDays(sourceDayName: string) {
    const source = days.find((d) => d.day === sourceDayName);
    if (!source) return;
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        slots: source.slots.map((s) => ({ ...s })),
      })),
    );
    setSuccess(`Copied ${sourceDayName}'s periods to all active weekdays.`);
    setTimeout(() => setSuccess(""), 4000);
  }

  // Handler: Auto-generate slots for all days
  function autoGenerateAllSlots() {
    setError("");
    const startMin = toMinutes(workingStart);
    const endMin = toMinutes(workingEnd);
    if (endMin <= startMin) {
      setError("Working end time must be after working start time.");
      return;
    }

    // Sort breaks by start time (ES2023+ toSorted)
    const sortedBreaks = breaks.toSorted(
      (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
    );

    const generatedDays: DaySchedule[] = days.map((d) => {
      let currentMin = startMin;
      const slots: TimeSlot[] = [];
      let periodIdx = 1;
      const effectiveEnd = d.is_half_day ? Math.min(startMin + 240, endMin) : endMin;

      while (currentMin + periodDuration <= effectiveEnd) {
        const potentialEnd = currentMin + periodDuration;

        // Check if overlaps with any break
        const overlappingBreak = sortedBreaks.find((b) => {
          const bStart = toMinutes(b.start_time);
          const bEnd = toMinutes(b.end_time);
          return Math.max(currentMin, bStart) < Math.min(potentialEnd, bEnd);
        });

        if (overlappingBreak) {
          // Jump to end of break
          currentMin = toMinutes(overlappingBreak.end_time) + transitionDuration;
          continue;
        }

        slots.push({
          name: `Period ${periodIdx}`,
          start_time: fromMinutes(currentMin),
          end_time: fromMinutes(potentialEnd),
        });
        periodIdx += 1;
        currentMin = potentialEnd + transitionDuration;
      }

      if (slots.length === 0) {
        slots.push({
          name: "Period 1",
          start_time: fromMinutes(startMin),
          end_time: fromMinutes(startMin + periodDuration),
        });
      }

      return {
        ...d,
        slots,
      };
    });

    setDays(generatedDays);
    setSuccess(
      `Generated period slots according to working hours (${workingStart}–${workingEnd}) and breaks.`,
    );
    setTimeout(() => setSuccess(""), 5000);
  }

  // Handler: Break controls
  function addBreak() {
    const newBrk: BreakItem = {
      name: `Short Break ${breaks.length + 1}`,
      start_time: "10:45",
      end_time: "11:00",
      duration: 15,
      is_lunch: false,
    };
    setBreaks([...breaks, newBrk]);
  }

  function updateBreak(index: number, field: keyof BreakItem, value: string | number | boolean | null | undefined) {
    setBreaks((prev) =>
      prev.map((b, idx) => (idx === index ? { ...b, [field]: value } : b)),
    );
  }

  function removeBreak(index: number) {
    setBreaks((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Handler: Save to Backend API
  async function saveConfiguration() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Validate in frontend first
      if (days.length === 0) {
        throw new Error("Select at least one weekday.");
      }
      for (const d of days) {
        if (d.slots.length === 0) {
          throw new Error(`Day ${d.day} must have at least one period.`);
        }
        for (let i = 0; i < d.slots.length; i++) {
          const s = d.slots[i];
          const sm = toMinutes(s.start_time);
          const em = toMinutes(s.end_time);
          if (em <= sm) {
            throw new Error(
              `${d.day} ${s.name}: End time (${s.end_time}) must be after start time (${s.start_time}).`,
            );
          }
          if (i > 0) {
            const prevEm = toMinutes(d.slots[i - 1].end_time);
            if (sm < prevEm) {
              throw new Error(
                `${d.day} ${s.name} (${s.start_time}) overlaps with previous period ending at ${d.slots[i - 1].end_time}.`,
              );
            }
          }
        }
      }

      const lunch = breaks.find((b) => b.is_lunch) || null;
      const nonLunchBreaks = breaks.filter((b) => !b.is_lunch);

      const payload = {
        working_hours_start: workingStart,
        working_hours_end: workingEnd,
        period_duration: periodDuration,
        transition_duration: transitionDuration,
        days,
        breaks: nonLunchBreaks,
        lunch_break: lunch,
        is_active: true,
      };

      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/timetable/configurations/${selectedSemester}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(payload),
        },
      );

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const detail =
          typeof body?.detail === "string"
            ? body.detail
            : `Failed to save configuration (${res.status}).`;
        throw new Error(detail);
      }

      setIsConfigured(true);
      if (!savedConfigsList.includes(selectedSemester)) {
        setSavedConfigsList([...savedConfigsList, selectedSemester]);
      }
      setOriginalSnapshot(currentSnapshot);
      setSuccess(
        `Successfully saved timetable configuration for Semester ${selectedSemester} to database!`,
      );
      if (onConfigSaved) {
        onConfigSaved(selectedSemester);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while saving the configuration.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Handler: Reset to default
  async function resetToDefault() {
    if (
      !confirm(
        `Are you sure you want to reset Semester ${selectedSemester} to the default schedule?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const token = await getToken().catch(() => null);
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/timetable/configurations/${selectedSemester}`,
        {
          method: "DELETE",
          headers,
        },
      );
      if (!res.ok) {
        throw new Error(`Could not reset configuration (${res.status}).`);
      }

      setIsConfigured(false);
      setSavedConfigsList((prev) => prev.filter((s) => s !== selectedSemester));

      // Re-fetch default
      const getRes = await fetch(
        `${API_BASE_URL}/api/timetable/configurations/${selectedSemester}`,
      );
      if (getRes.ok) {
        const data: SemesterConfig = await getRes.json();
        setWorkingStart(data.working_hours_start || "09:00");
        setWorkingEnd(data.working_hours_end || "16:00");
        setPeriodDuration(data.period_duration || 50);
        setTransitionDuration(
          data.transition_duration !== undefined && data.transition_duration !== null
            ? data.transition_duration
            : 5,
        );
        setDays(data.days || []);
        setBreaks(data.breaks || []);
        const snap = JSON.stringify({
          workingStart: data.working_hours_start || "09:00",
          workingEnd: data.working_hours_end || "16:00",
          periodDuration: data.period_duration || 50,
          transitionDuration:
            data.transition_duration !== undefined && data.transition_duration !== null
              ? data.transition_duration
              : 5,
          days: data.days || [],
          breaks: data.breaks || [],
        });
        setOriginalSnapshot(snap);
      }

      setSuccess(`Reverted Semester ${selectedSemester} to default schedule.`);
      if (onConfigSaved) onConfigSaved(selectedSemester);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  const activeDayObj = days.find((d) => d.day === activeTabDay);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#e5e7ee] bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#343956] text-white">
              <Layers size={16} />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#20242c]">
              Semester Timetable Configurations
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#828795]">
            Define semester-specific working hours, period lengths, weekdays, breaks, and half-day timings.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          )}

          <button
            onClick={resetToDefault}
            disabled={saving || loading || !isConfigured}
            className="flex items-center gap-1.5 rounded-xl border border-[#e5e7ee] bg-white px-3 py-2 text-xs font-semibold text-[#666c7a] transition hover:bg-[#f7f8fa] disabled:cursor-not-allowed disabled:opacity-40"
            title="Revert to standard default timetable"
          >
            <RotateCcw size={14} />
            Reset Default
          </button>

          <button
            onClick={saveConfiguration}
            disabled={saving || loading}
            className="flex items-center gap-1.5 rounded-xl bg-[#343956] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#464d70] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Semester Settings"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {success && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-sm">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-600" />
            <span>{success}</span>
          </div>
          <button
            onClick={() => setSuccess("")}
            className="text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-red-700 hover:text-red-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Semester Selector Bar */}
      <div className="rounded-2xl border border-[#e5e7ee] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#9ba0ad]">
            Select Semester to Configure
          </p>
          <span className="text-[11px] text-[#8e93a0]">
            {isConfigured ? (
              <span className="text-emerald-700 font-semibold">● Custom Saved Schedule</span>
            ) : (
              <span className="text-[#a0a4b0]">○ Using Default Schedule</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => {
            const isSelected = selectedSemester === sem;
            const hasCustom = savedConfigsList.includes(sem);
            return (
              <button
                key={sem}
                onClick={() => {
                  if (hasUnsavedChanges) {
                    if (
                      !confirm(
                        `You have unsaved changes in Semester ${selectedSemester}. Switch to Semester ${sem} anyway?`,
                      )
                    ) {
                      return;
                    }
                  }
                  setSelectedSemester(sem);
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border py-2.5 transition",
                  isSelected
                    ? "border-[#343956] bg-[#343956] text-white shadow-sm"
                    : "border-[#e6e8ee] bg-[#fafafc] text-[#4f5565] hover:bg-[#f0f1f6]",
                )}
              >
                <span className="text-xs font-bold">Sem {sem}</span>
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 rounded-full",
                    isSelected
                      ? "bg-white"
                      : hasCustom
                        ? "bg-emerald-500"
                        : "bg-[#d0d3de]",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Parameters & Auto Generator Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Working Hours & Period Length */}
        <div className="rounded-2xl border border-[#e5e7ee] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#2d323f]">
            <Clock size={16} className="text-[#5a618d]" />
            <h3>Daily Timings & Periods</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#5a5f6e]">Day Start</label>
                <input
                  type="time"
                  value={workingStart}
                  onChange={(e) => setWorkingStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#e0e3eb] bg-[#fcfcfe] px-3 py-2 outline-none focus:border-[#454c80]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5a5f6e]">Day End</label>
                <input
                  type="time"
                  value={workingEnd}
                  onChange={(e) => setWorkingEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#e0e3eb] bg-[#fcfcfe] px-3 py-2 outline-none focus:border-[#454c80]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#5a5f6e]">Period (min)</label>
                <input
                  type="number"
                  min="20"
                  max="120"
                  value={periodDuration}
                  onChange={(e) => setPeriodDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#e0e3eb] bg-[#fcfcfe] px-3 py-2 outline-none focus:border-[#454c80]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#5a5f6e]">Transition (min)</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={transitionDuration}
                  onChange={(e) => setTransitionDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#e0e3eb] bg-[#fcfcfe] px-3 py-2 outline-none focus:border-[#454c80]"
                />
              </div>
            </div>

            <button
              onClick={autoGenerateAllSlots}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#eef0f8] py-2.5 font-semibold text-[#3d4474] transition hover:bg-[#e2e5f3]"
            >
              <Sparkles size={14} />
              Auto-calculate Day Slots
            </button>
            <p className="text-[10px] leading-4 text-[#9a9eaa]">
              Automatically recalculates slot start/end times based on day start, duration, and configured breaks.
            </p>
          </div>
        </div>

        {/* Breaks & Lunch Config */}
        <div className="rounded-2xl border border-[#e5e7ee] bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[#2d323f]">
              <Coffee size={16} className="text-[#a47b4e]" />
              <h3>Breaks & Lunch Intervals</h3>
            </div>
            <button
              onClick={addBreak}
              className="flex items-center gap-1 rounded-lg border border-[#e4e6ed] px-2.5 py-1.5 text-xs font-semibold text-[#535868] transition hover:bg-[#f6f7fb]"
            >
              <Plus size={13} /> Add Break
            </button>
          </div>

          <div className="space-y-3">
            {breaks.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#a0a4b0]">
                No breaks configured for Semester {selectedSemester}. Click &ldquo;+ Add Break&rdquo; above.
              </p>
            ) : (
              breaks.map((b, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e9ebf2] bg-[#fbfbfd] p-3 text-xs"
                >
                  <input
                    type="text"
                    value={b.name}
                    onChange={(e) => updateBreak(idx, "name", e.target.value)}
                    placeholder="Break Name"
                    className="min-w-[120px] flex-1 rounded-lg border border-[#e0e3eb] bg-white px-2.5 py-1.5 outline-none font-semibold text-[#303544]"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#9195a2]">Start</span>
                    <input
                      type="time"
                      value={b.start_time}
                      onChange={(e) => updateBreak(idx, "start_time", e.target.value)}
                      className="rounded-lg border border-[#e0e3eb] bg-white px-2 py-1 outline-none text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#9195a2]">End</span>
                    <input
                      type="time"
                      value={b.end_time}
                      onChange={(e) => updateBreak(idx, "end_time", e.target.value)}
                      className="rounded-lg border border-[#e0e3eb] bg-white px-2 py-1 outline-none text-xs"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={Boolean(b.is_lunch)}
                      onChange={(e) => updateBreak(idx, "is_lunch", e.target.checked)}
                      className="rounded text-[#343956]"
                    />
                    <span className={cn("font-medium", b.is_lunch ? "text-amber-800" : "text-[#707584]")}>
                      Lunch Break
                    </span>
                  </label>
                  <button
                    onClick={() => removeBreak(idx)}
                    className="p-1 text-[#9fa3af] hover:text-red-600 transition ml-auto"
                    title="Remove break"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Weekday Selection Bar */}
      <div className="rounded-2xl border border-[#e5e7ee] bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-bold text-[#2d323f]">Active Weekdays & Schedule</h3>
            <p className="text-xs text-[#8c91a0]">
              Toggle which weekdays are active for Semester {selectedSemester}. Each day can have its own period schedule and half-day flag.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeDayObj && (
              <button
                onClick={() => copyScheduleToAllDays(activeDayObj.day)}
                className="flex items-center gap-1 rounded-xl border border-[#e4e6ed] px-3 py-1.5 text-xs font-semibold text-[#535868] transition hover:bg-[#f6f7fb]"
                title="Copy current day's period times to all other active days"
              >
                <Copy size={13} /> Copy {activeDayObj.day} to All Days
              </button>
            )}
          </div>
        </div>

        {/* Checkbox pills for all weekdays */}
        <div className="mb-6 flex flex-wrap gap-2">
          {ALL_WEEKDAYS.map((weekday) => {
            const isEnabled = days.some((d) => d.day === weekday);
            return (
              <button
                key={weekday}
                onClick={() => toggleWeekday(weekday)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  isEnabled
                    ? "border-[#cdd1e6] bg-[#f0f2fa] text-[#343956]"
                    : "border-[#e7e9f0] bg-white text-[#9aa0ae] hover:bg-[#fafafc]",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-md border text-[10px]",
                    isEnabled
                      ? "border-[#343956] bg-[#343956] text-white"
                      : "border-[#ccd0dc]",
                  )}
                >
                  {isEnabled && "✓"}
                </span>
                {weekday}
              </button>
            );
          })}
        </div>

        {/* Day Tab Switcher */}
        <div className="flex border-b border-[#eceef4]">
          {days.map((d) => (
            <button
              key={d.day}
              onClick={() => setActiveTabDay(d.day)}
              className={cn(
                "relative flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition",
                activeTabDay === d.day
                  ? "border-[#343956] text-[#343956]"
                  : "border-transparent text-[#7e8392] hover:text-[#343956]",
              )}
            >
              <span>{d.day}</span>
              <span className="rounded-full bg-[#f0f1f6] px-1.5 py-0.5 text-[10px] text-[#6d7281]">
                {d.slots.length}p
              </span>
              {d.is_half_day && (
                <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-semibold text-amber-800">
                  Half
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active Day Period Editor */}
        {activeDayObj && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f8f9fc] p-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-[#343956] text-sm">{activeDayObj.day}</span>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#505565]">
                  <input
                    type="checkbox"
                    checked={activeDayObj.is_half_day}
                    onChange={() => toggleHalfDay(activeDayObj.day)}
                    className="rounded text-[#343956]"
                  />
                  <span>Mark as Half-Day Schedule</span>
                </label>
              </div>

              <button
                onClick={() => addSlotToDay(activeDayObj.day)}
                className="flex items-center gap-1 rounded-lg bg-[#343956] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#464d70]"
              >
                <Plus size={13} /> Add Period
              </button>
            </div>

            {/* List of Periods */}
            <div className="space-y-2.5">
              {activeDayObj.slots.map((slot, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eceef4] bg-white p-3 text-xs shadow-xs"
                >
                  <span className="w-16 font-bold text-[#4c5264]">
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    value={slot.name}
                    onChange={(e) =>
                      updateSlot(activeDayObj.day, idx, "name", e.target.value)
                    }
                    className="w-32 rounded-lg border border-[#e0e3eb] px-2.5 py-1.5 font-semibold text-[#303544] outline-none"
                    placeholder="Period Name"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9195a2]">Start</span>
                    <input
                      type="time"
                      value={slot.start_time}
                      onChange={(e) =>
                        updateSlot(activeDayObj.day, idx, "start_time", e.target.value)
                      }
                      className="rounded-lg border border-[#e0e3eb] px-2 py-1 outline-none font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9195a2]">End</span>
                    <input
                      type="time"
                      value={slot.end_time}
                      onChange={(e) =>
                        updateSlot(activeDayObj.day, idx, "end_time", e.target.value)
                      }
                      className="rounded-lg border border-[#e0e3eb] px-2 py-1 outline-none font-medium"
                    />
                  </div>
                  <span className="text-[11px] text-[#8e93a0]">
                    ({toMinutes(slot.end_time) - toMinutes(slot.start_time)} mins)
                  </span>

                  <button
                    onClick={() => removeSlotFromDay(activeDayObj.day, idx)}
                    className="ml-auto rounded-lg p-1.5 text-[#9fa3af] transition hover:bg-red-50 hover:text-red-600"
                    title="Remove period"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
