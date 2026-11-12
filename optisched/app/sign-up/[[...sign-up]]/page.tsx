import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
          <CalendarDays className="h-4 w-4" />
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900">
          OptiSched
        </span>
      </div>

      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
              Loading registration...
            </div>
          }
        >
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border border-slate-200 rounded-lg p-6 bg-white",
                headerTitle: "text-base font-bold text-slate-900",
                headerSubtitle: "text-xs text-slate-500",
                formButtonPrimary:
                  "bg-slate-900 hover:bg-slate-800 text-xs font-semibold py-2 rounded-md",
                formFieldInput:
                  "rounded-md border-slate-300 text-xs focus:ring-1 focus:ring-slate-900 focus:border-slate-900",
                footerActionLink: "text-xs text-slate-900 font-semibold hover:underline",
              },
            }}
          />
        </Suspense>

        <p className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-slate-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
