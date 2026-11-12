import { ApiScheduleEntry, ScheduleEntry, User, AuthLoginResponse } from "./types";
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

export async function loginUser(email: string, password: string): Promise<AuthLoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Authentication failed");
  }
  return res.json();
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE_URL}/api/users`);
  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }
  return res.json();
}

export async function fetchUserById(userId: string): Promise<User> {
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch user with ID ${userId}`);
  }
  return res.json();
}

