import { redirect } from "next/navigation";
import { getServerUserProfile } from "@/lib/auth-role";
import FacultyClientView from "./FacultyClientView";


export default async function FacultyPage() {
  const profile = await getServerUserProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Allow admin and faculty to access faculty portal
  if (profile.role !== "faculty" && profile.role !== "admin") {
    redirect("/unauthorized");
  }

  return (
    <FacultyClientView
      userName={profile.name || "Faculty Member"}
      userEmail={profile.email || ""}
      userRole={profile.role}
    />
  );
}
