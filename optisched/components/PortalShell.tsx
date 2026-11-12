"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  LayoutDashboard,
  BookOpen,
  Sliders,
  Sparkles,
  Menu,
  X,
  GraduationCap,
  Briefcase,
  Shield,
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
  userName = "Academic User",
  userEmail,
  title,
  subtitle,
  activeTab,
  onTabChange,
  actions,
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roleMeta = {
    admin: {
      label: "Registry Admin",
      icon: Shield,
      badgeClass: "bg-slate-900 text-white border-slate-800",
      accentDot: "bg-slate-900",
    },
    faculty: {
      label: "Faculty Portal",
      icon: Briefcase,
      badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
      accentDot: "bg-blue-700",
    },
    student: {
      label: "Student Portal",
      icon: GraduationCap,
      badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
      accentDot: "bg-emerald-700",
    },
  }[role];

  const RoleIcon = roleMeta.icon;

  const navigationItems = [
    ...(role === "admin"
      ? [
          {
            id: "dashboard",
            label: "Overview & Timetable",
            icon: LayoutDashboard,
            type: "tab" as const,
          },
          {
            id: "academic-data",
            label: "Academic Data Management",
            icon: BookOpen,
            type: "tab" as const,
          },
          {
            id: "settings",
            label: "Semester Grid & Timing",
            icon: Sliders,
            type: "tab" as const,
          },
        ]
      : []),
    ...(role === "faculty"
      ? [
          {
            id: "/faculty",
            label: "Teaching Schedule",
            icon: CalendarDays,
            type: "link" as const,
          },
        ]
      : []),
    ...(role === "student"
      ? [
          {
            id: "/student",
            label: "Section Schedule",
            icon: CalendarDays,
            type: "link" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        )}
      >
        {/* Institutional Branding */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold text-slate-900"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-slate-900">
                OptiSched
              </span>
              <span className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">
                Academic Operations
              </span>
            </div>
          </Link>

          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Identity and Active Role */}
        <div className="border-b border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium tracking-wide",
                roleMeta.badgeClass
              )}
            >
              <RoleIcon className="h-3 w-3" />
              {roleMeta.label}
            </span>
          </div>
          <div className="mt-2.5">
            <p className="truncate text-xs font-semibold text-slate-900">
              {userName}
            </p>
            {userEmail && (
              <p className="truncate text-[11px] text-slate-500">{userEmail}</p>
            )}
          </div>
        </div>

        {/* Primary Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Workspace
          </p>

          <nav className="space-y-1" aria-label="Main Navigation">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.type === "tab"
                  ? activeTab === item.id
                  : pathname === item.id;

              if (item.type === "tab") {
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange?.(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-slate-900 text-white shadow-xs"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.id}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Cross-Role Navigation Links */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Portals
            </p>
            <div className="space-y-0.5">
              <Link
                href="/admin"
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors",
                  role === "admin"
                    ? "font-semibold text-slate-900 bg-slate-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <span>Admin Portal</span>
                {role === "admin" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                )}
              </Link>
              <Link
                href="/faculty"
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors",
                  role === "faculty"
                    ? "font-semibold text-slate-900 bg-slate-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <span>Faculty Portal</span>
                {role === "faculty" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-700" />
                )}
              </Link>
              <Link
                href="/student"
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors",
                  role === "student"
                    ? "font-semibold text-slate-900 bg-slate-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <span>Student Portal</span>
                {role === "student" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* Solver Engine Status Footnote */}
        <div className="border-t border-slate-200 p-3 bg-slate-50/50">
          <div className="rounded-md border border-slate-200 bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-slate-600" />
              <span>OR-Tools Engine</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Constraint-based optimization enforcing zero faculty or room
              collisions.
            </p>
          </div>
        </div>
      </aside>

      {/* Primary Application Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="capitalize">{role}</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-700">{title}</span>
              </div>
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {title}
              </h1>
              {subtitle && (
                <p className="hidden text-[11px] text-slate-500 sm:block">{subtitle}</p>
              )}
            </div>
          </div>

          {/* Action Bar and Profile Menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            {actions}
            <div className="ml-2 flex items-center border-l border-slate-200 pl-3">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "h-8 w-8 ring-1 ring-slate-200",
                  },
                }}
              />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
