import { ApiScheduleEntry, ScheduleEntry } from "./types";
import { toPeriodNumber } from "./utils";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_OPTISCHED_API_URL ?? "http://127.0.0.1:8000";

export function toUiEntry(entry: ApiScheduleEntry): ScheduleEntry {
  return {
    day: entry.day,
    period: toPeriodNumber(entry.period),
    periodName: entry.period,
    startTime: entry.start_time,
    endTime: entry.end_time,
    subject: entry.subject_name,
    faculty: entry.faculty_name,
    room: entry.room_name,
    type: entry.room_type === "lab" ? "Lab" : "Lecture",
    className: entry.class_name,
    subjectCode: entry.subject_code,
    department: entry.department,
    semester: entry.semester,
  };
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  getToken?: () => Promise<string | null>,
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Continue without token if getToken fails
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
