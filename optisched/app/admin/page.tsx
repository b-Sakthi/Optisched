import { redirect } from "next/navigation";
import { getServerUserProfile } from "@/lib/auth-role";
import AdminClientView from "./AdminClientView";


export default async function AdminPage() {
  const profile = await getServerUserProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  if (profile.role !== "admin") {
    redirect("/unauthorized");
  }

  return (
    <AdminClientView
      userName={profile.name || "Administrator"}
      userEmail={profile.email || ""}
    />
  );
}
