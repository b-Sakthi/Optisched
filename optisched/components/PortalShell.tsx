"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  BookOpen,
  Sliders,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalShellProps {
  role: "admin" | "faculty" | "student";
  userName?: string;
  userEmail?: string;
  title: string;
  subtitle?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PortalShell({
  role,
  userName = "User",
  title,
  subtitle,
  activeTab,
  onTabChange,
  actions,
  children,
}: PortalShellProps) {
  const pathname = usePathname();

  const roleBadge = {
    admin: { label: "Admin Portal", color: "bg-purple-100 text-purple-800 border-purple-200" },
    faculty: { label: "Faculty Portal", color: "bg-blue-100 text-blue-800 border-blue-200" },
    student: { label: "Student Portal", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  }[role];

  return (
    <div className="flex min-h-screen bg-[#f7f8fa] text-[#20242c]">
      {/* Sidebar Navigation */}
      <aside className="hidden w-[250px] shrink-0 flex-col border-r border-[#e8eaf0] bg-white px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#252a40] text-white shadow-sm">
            <CalendarDays size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#1a1e2d]">OptiSched</h1>
            <p className="text-[11px] text-[#8a8f9d]">University Timetabling</p>
          </div>
        </div>

        {/* Current Active Role Indicator */}
        <div className="mb-6 rounded-xl border border-[#eceef5] bg-[#fafafc] p-3">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                roleBadge.color
              )}
            >
              {roleBadge.label}
            </span>
          </div>
          <p className="mt-2 truncate text-xs font-semibold text-[#303546]">
            {userName}
          </p>
        </div>

        <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a1a5b1]">
          Workspace
        </p>

        <nav className="space-y-1">
          {role === "admin" && (
            <>
              <button
                onClick={() => onTabChange?.("dashboard")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  activeTab === "dashboard"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <LayoutDashboard size={16} /> Overview & Timetable
              </button>
              <button
                onClick={() => onTabChange?.("faculty")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  activeTab === "faculty"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <Users size={16} /> Faculty Management
              </button>
              <button
                onClick={() => onTabChange?.("curriculum")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  activeTab === "curriculum"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <BookOpen size={16} /> Subjects & Rooms
              </button>
              <button
                onClick={() => onTabChange?.("settings")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  activeTab === "settings"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <Sliders size={16} /> Semester Timings
              </button>
            </>
          )}

          {role === "student" && (
            <>
              <Link
                href="/student"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  pathname === "/student"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <LayoutDashboard size={16} /> My Schedule
              </Link>
            </>
          )}

          {role === "faculty" && (
            <>
              <Link
                href="/faculty"
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition",
                  pathname === "/faculty"
                    ? "bg-[#f0f1f8] text-[#454c80]"
                    : "text-[#747989] hover:bg-[#f7f8fa]"
                )}
              >
                <LayoutDashboard size={16} /> Teaching Schedule
              </Link>
            </>
          )}
        </nav>

        {/* Quick Portal Links for verified roles */}
        <div className="mt-8 border-t border-[#edf0f5] pt-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#a1a5b1]">
            Portals
          </p>
          <div className="space-y-1">
            <Link
              href="/admin"
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[#747989] hover:bg-[#f7f8fa]",
                role === "admin" && "text-[#454c80] font-semibold"
              )}
            >
              <span>Admin Portal</span>
              {role === "admin" && <span className="h-1.5 w-1.5 rounded-full bg-[#454c80]" />}
            </Link>
            <Link
              href="/faculty"
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[#747989] hover:bg-[#f7f8fa]",
                role === "faculty" && "text-[#454c80] font-semibold"
              )}
            >
              <span>Faculty Portal</span>
              {role === "faculty" && <span className="h-1.5 w-1.5 rounded-full bg-[#454c80]" />}
            </Link>
            <Link
              href="/student"
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-[#747989] hover:bg-[#f7f8fa]",
                role === "student" && "text-[#454c80] font-semibold"
              )}
            >
              <span>Student Portal</span>
              {role === "student" && <span className="h-1.5 w-1.5 rounded-full bg-[#454c80]" />}
            </Link>
          </div>
        </div>

        <div className="mt-auto rounded-2xl border border-[#e9eaf1] bg-[#fafafe] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#303546]">
            <Sparkles size={14} className="text-amber-500" />
            <span>OR-Tools Engine</span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[#858a98]">
            Validated constraint-based solver with zero time conflicts.
          </p>
        </div>
      </aside>

      {/* Main Content Pane */}
      <section className="min-w-0 flex-1 flex flex-col">
        {/* Header */}
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-[#e8eaf0] bg-white px-5 py-3 sm:px-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#9296a3]">
              <span className="capitalize">{role}</span>
              <span>/</span>
              <span>{title}</span>
            </div>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-[#1a1e2d]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-[#8a8f9d]">{subtitle}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {actions}
            <div className="ml-1 flex items-center border-l border-[#e7e9ef] pl-3">
              <UserButton />
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-5 sm:p-8">
          {children}
        </main>
      </section>
    </div>
  );
}
