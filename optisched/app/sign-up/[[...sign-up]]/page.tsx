import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading sign up...</div>}>
        <SignUp />
      </Suspense>
    </div>
  );
}
