import { ApiScheduleEntry, ScheduleEntry, User, AuthLoginResponse, SystemStatus } from "./types";
import { toPeriodNumber } from "./utils";
import { validatePassword, MIN_PASSWORD_LENGTH } from "./password-policy";

export { validatePassword, MIN_PASSWORD_LENGTH };

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
  const check = validatePassword(password);
  if (!check.isValid) {
    throw new Error(check.error || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

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

export async function createUser(data: {
  email: string;
  password: string;
  role?: "admin" | "faculty" | "student";
  name?: string;
  is_active?: boolean;
}): Promise<User> {
  const check = validatePassword(data.password);
  if (!check.isValid) {
    throw new Error(check.error || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const res = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create user");
  }
  return res.json();
}

export async function updateUser(
  userId: string,
  data: {
    email?: string;
    password?: string;
    role?: "admin" | "faculty" | "student";
    name?: string;
    is_active?: boolean;
  }
): Promise<User> {
  if (data.password !== undefined) {
    const check = validatePassword(data.password);
    if (!check.isValid) {
      throw new Error(check.error || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }

  const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update user");
  }
  return res.json();
}

export async function deleteUser(userId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete user");
  }
  return res.json();
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE_URL}/api/admin/system/status`);
  if (!res.ok) {
    throw new Error("Failed to fetch system monitoring status");
  }
  return res.json();
}

