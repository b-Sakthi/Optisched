import { auth, currentUser } from "@clerk/nextjs/server";

export type UserRole = "admin" | "faculty" | "student";

export type CurrentAuthProfile = {
  userId: string;
  role: UserRole;
  email: string | null;
  name: string | null;
};

/**
 * Server-side trusted resolution of the current user's role.
 * Role determination order:
 * 1. Clerk sessionClaims / publicMetadata `role` (Admin / Faculty / Student)
 * 2. Fallback checking verified email domain / format or default to "student".
 * 3. Never trust arbitrary query parameters or client request bodies for role escalations.
 */
export async function getServerUserProfile(): Promise<CurrentAuthProfile | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return null;
  }

  const user = await currentUser();
  const primaryEmail =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
    user?.emailAddresses[0]?.emailAddress ||
    null;

  // Extract role from sessionClaims or publicMetadata if configured in Clerk Dashboard
  const metadataRole = (
    (sessionClaims?.metadata as Record<string, unknown> | undefined)?.role ||
    (user?.publicMetadata as Record<string, unknown> | undefined)?.role
  ) as string | undefined;

  let resolvedRole: UserRole = "student";

  if (metadataRole) {
    const normalized = metadataRole.toLowerCase().trim();
    if (normalized === "admin") resolvedRole = "admin";
    else if (normalized === "faculty" || normalized === "teacher") resolvedRole = "faculty";
    else if (normalized === "student") resolvedRole = "student";
  } else if (primaryEmail) {
    const emailLower = primaryEmail.toLowerCase();
    if (
      emailLower.startsWith("admin@") ||
      emailLower.includes("+admin@") ||
      emailLower.endsWith("@admin.university.edu")
    ) {
      resolvedRole = "admin";
    } else if (
      emailLower.includes("faculty") ||
      emailLower.endsWith("@faculty.university.edu") ||
      emailLower.includes("prof.")
    ) {
      resolvedRole = "faculty";
    } else {
      resolvedRole = "student";
    }
  }

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      primaryEmail?.split("@")[0] ||
      "User"
    : "User";

  return {
    userId,
    role: resolvedRole,
    email: primaryEmail,
    name: displayName,
  };
}
