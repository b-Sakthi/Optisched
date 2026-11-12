import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { CalendarDays, CheckCircle2 } from "lucide-react";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const previewSlots = [
  { time: "09:00", subjects: ["CS101", "CS204", "MA102", "CS301", "Lab A"] },
  { time: "10:00", subjects: ["MA102", "CS101", "CS204", "CS302", "Lab A"] },
  { time: "11:00", subjects: ["CS301", "MA201", "CS101", "MA102", "CS204"] },
  { time: "12:00", subjects: ["CS204", "CS301", "MA201", "CS101", "Elective"] },
];

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      {/* Product presentation - Academic Registry */}
      <section className="flex flex-col justify-between border-b border-slate-800 bg-slate-950 px-6 py-10 text-white sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 xl:px-20">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-base font-bold tracking-tight text-white"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-white">
              <CalendarDays className="h-4 w-4" />
            </div>
            <span>OptiSched</span>
          </Link>

          <div className="mt-16 max-w-xl">
            <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              University Operations
            </span>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Academic Timetable Optimization.
            </h1>

            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              Automated, conflict-free scheduling powered by mathematical constraint
              satisfaction. Engineered for university administrators, faculty, and students.
            </p>

            {/* Illustrative Schedule Matrix */}
            <div className="mt-8 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-slate-200">
                    Master Timetable Preview
                  </span>
                </div>
                <span className="rounded-xs bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  CP-SAT Solved
                </span>
              </div>

              <div className="overflow-x-auto p-3">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-[55px_repeat(5,minmax(0,1fr))] gap-1.5 text-center text-xs">
                    <div />
                    {days.map((day) => (
                      <div
                        key={day}
                        className="py-1 text-[10px] font-bold text-slate-400 uppercase"
                      >
                        {day}
                      </div>
                    ))}

                    {previewSlots.map((slot) => (
                      <div key={slot.time} className="contents">
                        <div className="flex items-center text-[10px] font-medium text-slate-500 tabular-nums">
                          {slot.time}
                        </div>
                        {slot.subjects.map((sub, i) => (
                          <div
                            key={`${slot.time}-${i}`}
                            className="flex min-h-[44px] items-center justify-center rounded-sm border border-slate-800 bg-slate-800/60 p-1 text-[10px] font-semibold text-slate-200"
                          >
                            {sub}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/70 px-4 py-2.5 text-[11px] text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Zero room overlaps · Faculty exclusivity · Verified eligibility</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-[11px] text-slate-500">
          <span>OptiSched Operations Platform · Academic Year 2026–2027</span>
        </div>
      </section>

      {/* Authentication Container */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:min-h-screen">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              Portal Access
            </span>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Sign In to OptiSched
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Use your authorized university identity credentials.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center text-xs text-slate-500">
                Loading secure sign in...
              </div>
            }
          >
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
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

          <div className="mt-6 border-t border-slate-200 pt-4 text-center">
            <p className="text-[11px] text-slate-500">
              Role permissions are automatically resolved upon sign in.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
