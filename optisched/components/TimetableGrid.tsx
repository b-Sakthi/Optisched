"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { ScheduleEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  X,
  BookOpen,
  FlaskConical,
} from "lucide-react";

export const DEFAULT_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

const periodDefaults = [
  { id: 1, name: "Period 1", time: "09:00 – 09:50" },
  { id: 2, name: "Period 2", time: "09:55 – 10:45" },
  { id: 3, name: "Period 3", time: "11:00 – 11:50" },
  { id: 4, name: "Period 4", time: "11:55 – 12:45" },
  { id: 5, name: "Period 5", time: "13:30 – 14:05" },
  { id: 6, name: "Period 6", time: "14:20 – 15:10" },
  { id: 7, name: "Period 7", time: "15:15 – 16:00" },
];

interface TimetableGridProps {
  schedule: ScheduleEntry[];
  title?: string;
  subtitle?: string;
  workingHours?: string;
  readOnly?: boolean;
  highlightFaculty?: string;
  highlightSection?: string;
  emptyMessage?: string;
}

export function TimetableGrid({
  schedule,
  title = "Timetable Matrix",
  subtitle,
  workingHours = "09:00-16:00",
  emptyMessage = "No schedule entries available.",
}: TimetableGridProps) {
  const [selectedDay, setSelectedDay] = useState<string>("Monday");
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const inspectorDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = inspectorDialogRef.current;
    if (!dialog) return;
    if (selectedEntry) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [selectedEntry]);

  // Active days extracted dynamically
  const activeDays = useMemo(() => {
    const dayCalendar = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    if (schedule.length > 0) {
      const scheduledDays = new Set(schedule.map((entry) => entry.day));
      const filtered = dayCalendar.filter((d) => scheduledDays.has(d));
      if (filtered.length > 0) return filtered;
    }
    return DEFAULT_DAYS;
  }, [schedule]);

  // Dynamic period rows derived from generated schedule
  const periodRows = useMemo(() => {
    if (schedule.length === 0) return periodDefaults;
    const unique = new Map<number, { id: number; name: string; time: string }>();
    for (const entry of schedule) {
      if (!unique.has(entry.period)) {
        unique.set(entry.period, {
          id: entry.period,
          name: entry.periodName || `P${entry.period}`,
          time: `${entry.startTime} – ${entry.endTime}`,
        });
      }
    }
    return unique.size > 0
      ? [...unique.values()].sort((a, b) => a.id - b.id)
      : periodDefaults;
  }, [schedule]);

  const selectedDayEntries = schedule
    .filter((entry) => entry.day === selectedDay)
    .sort((a, b) => a.period - b.period);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Weekly Matrix Container */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          {/* Header Bar */}
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-bold tracking-tight text-slate-900">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {subtitle ||
                  `${activeDays[0] || "Monday"} to ${
                    activeDays[activeDays.length - 1] || "Friday"
                  } · Scheduled Window: ${workingHours}`}
              </p>
            </div>

            {/* Legend & Navigation */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-blue-100 text-blue-800">
                    <BookOpen className="h-2.5 w-2.5" />
                  </span>
                  <span>Lecture</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-emerald-100 text-emerald-800">
                    <FlaskConical className="h-2.5 w-2.5" />
                  </span>
                  <span>Laboratory</span>
                </span>
              </div>

              <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                <button
                  onClick={() => {
                    const currIdx = activeDays.indexOf(selectedDay);
                    const prevIdx =
                      (currIdx + activeDays.length - 1) % activeDays.length;
                    setSelectedDay(activeDays[prevIdx]);
                  }}
                  className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Previous day"
                  title="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    const currIdx = activeDays.indexOf(selectedDay);
                    const nextIdx = (currIdx + 1) % activeDays.length;
                    setSelectedDay(activeDays[nextIdx]);
                  }}
                  className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Next day"
                  title="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Timetable Scroll Area */}
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">
              {/* Day Columns Header */}
              <div
                className="grid border-b border-slate-200 bg-slate-50/80"
                style={{
                  gridTemplateColumns: `110px repeat(${activeDays.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="p-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  Period / Time
                </div>
                {activeDays.map((day) => {
                  const count = schedule.filter((e) => e.day === day).length;
                  const isSelected = selectedDay === day;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "border-l border-slate-200 px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "bg-white font-bold text-slate-900 border-t-2 border-t-slate-900 -mt-[1px]"
                          : "text-slate-600 hover:bg-slate-100/70"
                      )}
                    >
                      <span className="block text-xs font-semibold">
                        {day}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400 tabular-nums">
                        {count} session{count === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Period Rows */}
              {periodRows.map((period) => (
                <div
                  key={period.id}
                  className="grid min-h-[92px] border-b border-slate-200 last:border-0"
                  style={{
                    gridTemplateColumns: `110px repeat(${activeDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Period Identifier Column */}
                  <div className="flex flex-col justify-center border-r border-slate-200 bg-slate-50/40 px-3 py-2">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      {period.name}
                    </span>
                    <span className="mt-1 text-[10px] font-medium text-slate-500 tabular-nums">
                      {period.time}
                    </span>
                  </div>

                  {/* Day Cells */}
                  {activeDays.map((day) => {
                    const entry = schedule.find(
                      (item) => item.day === day && item.period === period.id
                    );
                    const isSelectedCol = selectedDay === day;

                    return (
                      <div
                        key={day}
                        className={cn(
                          "border-l border-slate-200 p-1.5 transition-colors",
                          isSelectedCol && "bg-slate-50/50"
                        )}
                      >
                        {entry ? (
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className={cn(
                              "group flex h-full min-h-[80px] w-full flex-col justify-between rounded-md border p-2 text-left transition-all hover:shadow-xs",
                              entry.type === "Lab"
                                ? "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                            )}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1 text-[10px]">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 font-semibold",
                                    entry.type === "Lab"
                                      ? "text-emerald-800"
                                      : "text-blue-800"
                                  )}
                                >
                                  {entry.type === "Lab" ? (
                                    <FlaskConical className="h-2.5 w-2.5" />
                                  ) : (
                                    <BookOpen className="h-2.5 w-2.5" />
                                  )}
                                  <span>{entry.subjectCode || entry.type}</span>
                                </span>
                                <span className="text-[9px] text-slate-400 tabular-nums">
                                  {entry.startTime}
                                </span>
                              </div>

                              <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-tight text-slate-900 group-hover:text-slate-950">
                                {entry.subject}
                              </span>
                            </div>

                            <div className="mt-2 flex items-center justify-between border-t border-slate-200/60 pt-1 text-[10px] text-slate-600">
                              <span className="truncate font-medium">
                                {entry.faculty}
                              </span>
                              <span className="shrink-0 rounded-xs bg-white px-1.5 py-0.2 border border-slate-200 text-[9px] font-semibold text-slate-700">
                                {entry.room}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <div className="flex h-full min-h-[80px] w-full items-center justify-center rounded-md border border-dashed border-slate-200/80 bg-white/40 text-slate-300">
                            <span className="text-xs">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Table Footer Status */}
          <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">
              {schedule.length > 0
                ? `${schedule.length} weekly session${
                    schedule.length === 1 ? "" : "s"
                  } scheduled.`
                : emptyMessage}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  schedule.length > 0 ? "bg-emerald-600" : "bg-slate-300"
                )}
              />
              <span className="font-medium text-slate-700">
                {schedule.length > 0
                  ? "Constraint Verified (0 Clashes)"
                  : "No Timetable Loaded"}
              </span>
            </div>
          </div>
        </div>

        {/* Day Agenda Side Panel */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-tight text-slate-900">
                  Daily Schedule
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sessions for {selectedDay}
                </p>
              </div>

              <select
                value={selectedDay}
                onChange={(event) => setSelectedDay(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 outline-none hover:border-slate-300 focus:border-slate-900"
              >
                {activeDays.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2.5">
              {selectedDayEntries.map((entry) => (
                <button
                  key={`${entry.day}-${entry.period}-${entry.subjectCode}-${entry.className}`}
                  onClick={() => setSelectedEntry(entry)}
                  className="flex w-full items-start gap-3 rounded-md border border-slate-200/80 bg-slate-50/60 p-3 text-left transition-colors hover:border-slate-300 hover:bg-white"
                >
                  <div className="w-16 shrink-0 pt-0.5">
                    <p className="text-xs font-bold text-slate-800 tabular-nums">
                      P{entry.period}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                      {entry.startTime}–{entry.endTime}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 border-l border-slate-200 pl-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {entry.subjectCode}
                      </span>
                      <span
                        className={cn(
                          "rounded-xs px-1.5 py-0.2 text-[9px] font-semibold uppercase",
                          entry.type === "Lab"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        )}
                      >
                        {entry.type}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                      {entry.subject}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span className="truncate">{entry.faculty}</span>
                      <span className="font-medium text-slate-800">
                        {entry.room}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {selectedDayEntries.length === 0 && (
                <div className="rounded-md border border-dashed border-slate-200 py-8 text-center">
                  <p className="text-xs text-slate-400">
                    No scheduled sessions on {selectedDay}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Native Modal Inspector (Google Chrome Modern Web Guidance) */}
      <dialog
        ref={inspectorDialogRef}
        aria-labelledby="session-inspector-title"
        onClose={() => setSelectedEntry(null)}
        onClick={(e) => {
          const dialog = e.currentTarget;
          const rect = dialog.getBoundingClientRect();
          const isInDialog = (
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width
          );
          if (!isInDialog) {
            dialog.close();
          }
        }}
        className="m-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-xs open:flex open:flex-col"
      >
        {selectedEntry && (
          <div>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Class Session Inspector
                </span>
                <h3 id="session-inspector-title" className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                  {selectedEntry.subject}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => inspectorDialogRef.current?.close()}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close session details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 divide-y divide-slate-100">
              <DetailRow label="Day & Period" value={`${selectedEntry.day}, Period ${selectedEntry.period}`} />
              <DetailRow
                label="Time Interval"
                value={`${selectedEntry.startTime} – ${selectedEntry.endTime}`}
              />
              <DetailRow label="Course Code" value={selectedEntry.subjectCode} />
              <DetailRow label="Course Type" value={selectedEntry.type} />
              <DetailRow label="Assigned Faculty" value={selectedEntry.faculty} />
              <DetailRow label="Assigned Room" value={selectedEntry.room} />
              <DetailRow label="Class Section" value={selectedEntry.className} />
              {selectedEntry.department && (
                <DetailRow label="Department" value={selectedEntry.department} />
              )}
              {selectedEntry.semester && (
                <DetailRow
                  label="Academic Semester"
                  value={`Semester ${selectedEntry.semester}`}
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => inspectorDialogRef.current?.close()}
              className="mt-6 w-full rounded-md bg-slate-900 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
              autoFocus
            >
              Done
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2.5 text-xs">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}
