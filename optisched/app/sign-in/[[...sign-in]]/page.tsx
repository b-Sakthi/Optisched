
import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const slots = [
  { time: "09:00", subjects: ["DBMS", "Networks", "Algorithms", "OS", "Project Lab"] },
  { time: "10:00", subjects: ["Algorithms", "DBMS", "Computer Networks", "AI & ML", "Project Lab"] },
  { time: "11:00", subjects: ["OS", "Compiler Design", "DBMS", "Algorithms", "Elective"] },
  { time: "12:00", subjects: ["AI & ML", "OS", "Compiler Design", "DBMS", "Elective"] },
];

const colors = [
  "bg-blue-100 text-blue-950",
  "bg-violet-100 text-violet-950",
  "bg-emerald-100 text-emerald-950",
  "bg-amber-100 text-amber-950",
  "bg-rose-100 text-rose-950",
];

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      {/* Product presentation */}
      <section className="flex flex-col justify-center overflow-hidden bg-[#101b35] px-5 py-10 text-white sm:px-9 lg:min-h-screen lg:px-12 xl:px-16">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="mr-2 text-blue-400">▦</span>
          OptiSched
        </Link>

        <div className="mx-auto mt-12 w-full max-w-3xl lg:my-auto lg:py-12">
          <p className="text-sm font-semibold tracking-wide text-blue-300">
            A BETTER WAY TO SCHEDULE
          </p>

          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Complex schedules,
            <span className="block text-blue-400">solved.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
            Organize classes, faculty, rooms, and lab sessions in one
            constraint-aware timetable workspace.
          </p>

          {/* Illustrative timetable */}
          <div className="mt-9 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
              <div>
                <p className="font-semibold text-slate-900">
                  Weekly timetable
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Illustrative product preview
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                Sample
              </span>
            </div>

            <div className="overflow-x-auto p-3 sm:p-4">
              <div className="min-w-[510px]">
                <div className="grid grid-cols-[54px_repeat(5,minmax(0,1fr))] gap-1.5">
                  <div />
                  {days.map((day) => (
                    <div
                      key={day}
                      className="py-2 text-center text-[10px] font-semibold text-slate-600"
                    >
                      {day.slice(0, 3).toUpperCase()}
                    </div>
                  ))}

                  {slots.map((slot, rowIndex) => (
                    <div key={slot.time} className="contents">
                      <div className="flex items-center text-xs font-medium text-slate-700">
                        {slot.time}
                      </div>
                      {slot.subjects.map((subject, colIndex) => (
                        <div
                          key={`${slot.time}-${colIndex}`}
                          className={`flex min-h-[64px] items-center justify-center rounded-md p-1.5 text-center text-[10px] font-semibold leading-4 sm:text-xs ${
                            colors[(rowIndex + colIndex) % colors.length]
                          }`}
                        >
                          {subject}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800">
                ✓
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Constraint-aware scheduling
                </p>
                <p className="text-xs leading-5 text-slate-600">
                  Designed to account for faculty, room, and time constraints.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-300">
          Plan better. Make every period count.
        </p>
      </section>

      {/* Authentication */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:min-h-screen lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-12 flex justify-end">
            <Link
              href="/"
              className="text-sm font-medium text-slate-700 underline-offset-4 hover:text-blue-700 hover:underline"
            >
              ← Back to home
            </Link>
          </div>

          <div className="mb-8">
            <p className="text-sm font-semibold text-blue-700">
              YOUR WORKSPACE
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#101b35] sm:text-4xl">
              Welcome back.
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Sign in to access your academic workspace.
            </p>
          </div>

          <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading sign in...</div>}>
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  cardBox: "w-full shadow-none",
                  card: "w-full border-0 shadow-none",
                  headerTitle: "text-slate-900",
                  headerSubtitle: "text-slate-600",
                  formFieldLabel: "font-medium text-slate-800",
                  formFieldInput: "border-slate-300",
                  formButtonPrimary: "bg-[#101b35] hover:bg-[#20345b]",
                  footerActionLink: "font-semibold text-blue-700",
                },
              }}
            />
          </Suspense>

          <p className="mt-8 border-t border-slate-200 pt-5 text-center text-xs leading-5 text-slate-600">
            Your account determines your access permissions.
          </p>
        </div>
      </section>
    </main>
  );
}
