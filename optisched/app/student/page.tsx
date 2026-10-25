import { redirect } from "next/navigation";
import { getServerUserProfile } from "@/lib/auth-role";
import StudentClientView from "./StudentClientView";


export default async function StudentPage() {
  const profile = await getServerUserProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Allow admin and student to access student portal
  if (profile.role !== "student" && profile.role !== "admin") {
    redirect("/unauthorized");
  }

  return (
    <StudentClientView
      userName={profile.name || "Student"}
      userEmail={profile.email || ""}
      userRole={profile.role}
    />
  );
}
