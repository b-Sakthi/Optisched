import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage({
  requiredRole = "authorized",
  currentRole,
}: {
  requiredRole?: string;
  currentRole?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-4 text-[#20242c]">
      <div className="w-full max-w-md rounded-2xl border border-[#e8eaf0] bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={32} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1e2d]">
          Access Restricted
        </h1>
        <p className="mt-2 text-sm text-[#747989]">
          You do not have permission to view the {requiredRole} portal.
          {currentRole && (
            <span className="block mt-1 font-medium text-[#454c80]">
              Your account is currently identified as: {currentRole}.
            </span>
          )}
        </p>
        <p className="mt-3 text-xs leading-5 text-[#9296a3]">
          Role privileges are enforced by verified server-side identity. Contact
          the system administrator if you believe this is in error.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-xl bg-[#343956] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#464d70]"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <Link
            href="/student"
            className="rounded-xl border border-[#e5e7ee] px-4 py-2 text-xs font-medium text-[#555b69] transition hover:bg-[#f7f8fa]"
          >
            Go to Student Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
