import Link from "next/link";
import { ShieldAlert, ArrowLeft, CalendarDays } from "lucide-react";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ requiredRole?: string; currentRole?: string }>;
}) {
  const { requiredRole = "authorized", currentRole } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-slate-900">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
          <CalendarDays className="h-4 w-4" />
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900">
          OptiSched
        </span>
      </div>

      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <ShieldAlert className="h-6 w-6" />
        </div>

        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          Portal Access Restricted
        </h1>

        <p className="mt-2 text-xs text-slate-600">
          You do not possess the required privileges to access the{" "}
          <span className="font-semibold text-slate-900 capitalize">
            {requiredRole}
          </span>{" "}
          workspace.
        </p>

        {currentRole && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 py-2 px-3 text-xs text-slate-700">
            Current Session Role:{" "}
            <span className="font-bold text-slate-900 uppercase">
              {currentRole}
            </span>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          OptiSched strictly enforces role-based access control based on verified
          institutional credentials. Please contact the university administrator to request role reassignment.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Workspace</span>
          </Link>

          <Link
            href="/student"
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            View Student Schedule
          </Link>
        </div>
      </div>
    </div>
  );
}
