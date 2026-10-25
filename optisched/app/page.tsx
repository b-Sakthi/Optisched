import { redirect } from "next/navigation";
import { getServerUserProfile } from "@/lib/auth-role";


export default async function IndexPage() {
  const profile = await getServerUserProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Redirect to verified role dashboard
  if (profile.role === "admin") {
    redirect("/admin");
  } else if (profile.role === "faculty") {
    redirect("/faculty");
  } else {
    redirect("/student");
  }
}
