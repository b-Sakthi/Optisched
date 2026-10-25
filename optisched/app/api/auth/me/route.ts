import { NextResponse } from "next/server";
import { getServerUserProfile } from "@/lib/auth-role";

export async function GET() {
  try {
    const profile = await getServerUserProfile();
    if (!profile) {
      return NextResponse.json({ authenticated: false, role: null }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      ...profile,
    });
  } catch (error) {
    return NextResponse.json(
      { authenticated: false, error: "Failed to resolve authenticated role" },
      { status: 500 }
    );
  }
}
