"use client";

import { useMemo, useState } from "react";
import { ScheduleEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

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
  title = "Timetable Schedule",
  subtitle,
  workingHours = "09:00-16:00",
  emptyMessage = "No schedule entries available.",
}: TimetableGridProps) {
  const [selectedDay, setSelectedDay] = useState<string>("Monday");
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);

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
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_310px]">
        {/* Weekly Grid */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#e7e9ef] bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-[#eceef3] p-5 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-bold text-[#1f2438]">{title}</h3>
              <p className="mt-1 text-xs text-[#9296a3]">
                {subtitle ||
                  `${activeDays[0] || "Monday"} to ${
                    activeDays[activeDays.length - 1] || "Friday"
                  } · Working Hours: ${workingHours}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] text-[#8b90a0]">
                <span className="h-2 w-2 rounded-full bg-[#8995cf]" /> Lecture
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[#8b90a0]">
                <span className="h-2 w-2 rounded-full bg-[#82b9a6]" /> Lab
              </span>
              <button
                onClick={() =>
                  setSelectedDay(
                    activeDays[(activeDays.indexOf(selectedDay) + 1) % activeDays.length]
                  )
                }
                className="ml-2 rounded-lg border border-[#e8eaf0] p-2 hover:bg-[#f7f8fa]"
                aria-label="Next day"
                title="Next day"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[740px]">
              {/* Day header row */}
              <div
                className="grid border-b border-[#eceef3] bg-[#fbfbfd]"
                style={{
                  gridTemplateColumns: `105px repeat(${activeDays.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="p-3 text-[10px] font-semibold uppercase tracking-wider text-[#a1a5b1]">
                  Period
                </div>
                {activeDays.map((day) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "border-l border-[#eceef3] px-2 py-3 text-left transition",
                      selectedDay === day && "bg-[#f0f1f8]"
                    )}
                  >
                    <span
                      className={cn(
                        "block text-xs font-bold",
                        selectedDay === day ? "text-[#454c80]" : "text-[#555b69]"
                      )}
                    >
                      {day.slice(0, 3)}
                    </span>
                    <span className="mt-1 block text-[10px] text-[#9b9fac]">
                      {schedule.filter((entry) => entry.day === day).length} sessions
                    </span>
                  </button>
                ))}
              </div>

              {/* Period Rows */}
              {periodRows.map((period) => (
                <div
                  key={period.id}
                  className="grid min-h-[91px] border-b border-[#eff0f4] last:border-0"
                  style={{
                    gridTemplateColumns: `105px repeat(${activeDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="flex flex-col justify-center px-3">
                    <span className="text-xs font-bold text-[#555b69]">P{period.id}</span>
                    <span className="mt-1 text-[9px] leading-4 text-[#a1a5b1]">
                      {period.time}
                    </span>
                  </div>
                  {activeDays.map((day) => {
                    const entry = schedule.find(
                      (item) => item.day === day && item.period === period.id
                    );
                    return (
                      <div
                        key={day}
                        className={cn(
                          "border-l border-[#eff0f4] p-1.5",
                          selectedDay === day && "bg-[#fafaff]"
                        )}
                      >
                        {entry ? (
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className={cn(
                              "h-full min-h-[76px] w-full rounded-lg border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
                              entry.type === "Lab"
                                ? "border-[#d7e9e1] bg-[#f0f8f4]"
                                : "border-[#e0e3f3] bg-[#f3f4fb]"
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <span
                                className={cn(
                                  "block text-[9px] font-bold uppercase tracking-wide",
                                  entry.type === "Lab"
                                    ? "text-[#4e9179]"
                                    : "text-[#6975b4]"
                                )}
                              >
                                {entry.type}
                              </span>
                              <span className="text-[8px] text-[#9a9eaa]">
                                {entry.startTime}–{entry.endTime}
                              </span>
                            </div>
                            <span className="block text-[10px] font-bold leading-4 text-[#343946] sm:text-[11px]">
                              {entry.subject}
                            </span>
                            <span className="mt-1 block truncate text-[9px] text-[#858a98]">
                              {entry.faculty}
                            </span>
                            <div className="mt-1 flex items-center justify-between text-[9px] text-[#9a9eaa]">
                              <span>{entry.room}</span>
                              <span className="font-medium text-[#747989]">
                                {entry.className}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <div className="flex h-full min-h-[76px] w-full items-center justify-center rounded-lg border border-dashed border-[#e8eaf0] text-[#d1d3dc]">
                            <span className="text-[10px]">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#eceef3] bg-[#fcfcfe] px-5 py-3 text-[10px] text-[#969aa7] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {schedule.length > 0
                ? `${schedule.length} weekly sessions in total.`
                : emptyMessage}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  schedule.length > 0 ? "bg-emerald-500" : "bg-amber-400"
                )}
              />
              {schedule.length > 0 ? "Schedule active" : "No sessions loaded"}
            </span>
          </div>
        </div>

        {/* Day Overview Side Panel */}
        <aside className="space-y-5">
          <div className="rounded-2xl border border-[#e7e9ef] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1f2438]">Daily Schedule</h3>
                <p className="mt-0.5 text-xs text-[#9296a3]">Sessions for {selectedDay}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setSelectedDay(
                      activeDays[
                        (activeDays.indexOf(selectedDay) + activeDays.length - 1) %
                          activeDays.length
                      ]
                    )
                  }
                  className="rounded-lg border border-[#e8eaf0] p-1.5 hover:bg-[#f7f8fa]"
                  aria-label="Previous day"
                  title="Previous day"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() =>
                    setSelectedDay(
                      activeDays[(activeDays.indexOf(selectedDay) + 1) % activeDays.length]
                    )
                  }
                  className="rounded-lg border border-[#e8eaf0] p-1.5 hover:bg-[#f7f8fa]"
                  aria-label="Next day"
                  title="Next day"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl bg-[#f7f8fb] p-3">
              <div>
                <p className="text-sm font-bold text-[#343956]">{selectedDay}</p>
                <p className="mt-0.5 text-[11px] text-[#9296a3]">
                  {selectedDayEntries.length} session(s)
                </p>
              </div>
              <select
                value={selectedDay}
                onChange={(event) => setSelectedDay(event.target.value)}
                className="max-w-[125px] rounded-lg border border-[#e6e8ef] bg-white px-2 py-1.5 text-xs outline-none"
              >
                {activeDays.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              {selectedDayEntries.map((entry) => (
                <button
                  key={`${entry.day}-${entry.period}-${entry.subjectCode}-${entry.className}`}
                  onClick={() => setSelectedEntry(entry)}
                  className="flex w-full items-start gap-3 rounded-lg p-1.5 text-left transition hover:bg-[#f9fafc]"
                >
                  <div className="w-[65px] shrink-0 pt-0.5">
                    <p className="text-[11px] font-semibold text-[#555b69]">
                      P{entry.period}
                    </p>
                    <p className="mt-0.5 text-[9px] text-[#9da1ad]">
                      {entry.startTime}–{entry.endTime}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 border-l-2 border-[#dfe2f2] pb-1 pl-3">
                    <p className="truncate text-xs font-semibold text-[#20242c]">
                      {entry.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-[#9296a3]">
                      {entry.faculty} · {entry.room}
                    </p>
                    <span className="mt-1 inline-block rounded bg-[#eff0f7] px-1.5 py-0.5 text-[9px] font-medium text-[#454c80]">
                      {entry.className}
                    </span>
                  </div>
                </button>
              ))}
              {selectedDayEntries.length === 0 && (
                <p className="py-6 text-center text-xs text-[#9296a3]">
                  No sessions scheduled for {selectedDay}.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#20242c]/30 p-4 backdrop-blur-[2px]"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#e7e9ef] bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-[#9296a3]">Class Session Details</p>
                <h3 className="mt-1 text-lg font-bold text-[#20242c]">
                  {selectedEntry.subject}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-2 hover:bg-[#f4f5f8]"
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3.5">
              <DetailRow label="Day" value={selectedEntry.day} />
              <DetailRow
                label="Period"
                value={`P${selectedEntry.period} (${selectedEntry.startTime} – ${selectedEntry.endTime})`}
              />
              <DetailRow label="Subject Code" value={selectedEntry.subjectCode} />
              <DetailRow label="Faculty" value={selectedEntry.faculty} />
              <DetailRow label="Room" value={selectedEntry.room} />
              <DetailRow label="Section" value={selectedEntry.className} />
              <DetailRow label="Session Type" value={selectedEntry.type} />
              {selectedEntry.department && (
                <DetailRow label="Department" value={selectedEntry.department} />
              )}
              {selectedEntry.semester && (
                <DetailRow
                  label="Semester"
                  value={`Semester ${selectedEntry.semester}`}
                />
              )}
            </div>
            <button
              onClick={() => setSelectedEntry(null)}
              className="mt-6 w-full rounded-xl bg-[#343956] py-2.5 text-xs font-semibold text-white transition hover:bg-[#464d70]"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#eff0f4] pb-2.5 last:border-0 last:pb-0">
      <span className="text-xs text-[#9296a3]">{label}</span>
      <span className="text-right text-xs font-semibold text-[#343946]">{value}</span>
    </div>
  );
}
