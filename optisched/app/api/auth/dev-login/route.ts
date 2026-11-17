import { NextRequest, NextResponse } from "next/server";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";

const KNOWN_USERS: Record<string, string> = {
  "admin@optisched.com": "user_3M3TBgJGi40gMDAinOZHra4FKf4",
  "faculty@optisched.com": "user_3M3WGNiAzGjabmlHqaa9nLmpQil",
  "student@optisched.com": "user_3M3WGXvbwwwWsFy9Q1HXzcIyVYH",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email || "admin@optisched.com").toLowerCase().trim();

    let userId = KNOWN_USERS[email];

    // If not in static map, query Clerk users API
    if (!userId && CLERK_SECRET_KEY) {
      const listRes = await fetch(
        `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${CLERK_SECRET_KEY}`,
            "User-Agent": "Mozilla/5.0 OptiSched/1.0",
          },
        }
      );
      if (listRes.ok) {
        const users = await listRes.json();
        if (users && users.length > 0) {
          userId = users[0].id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: `User with email ${email} not found in Clerk.` },
        { status: 404 }
      );
    }

    // Generate sign-in token to bypass email OTP and credentials prompt
    const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 OptiSched/1.0",
      },
      body: JSON.stringify({
        user_id: userId,
        expires_in_seconds: 3600,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || "Failed to generate sign-in token." },
        { status: tokenRes.status }
      );
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.token;

    return NextResponse.json({
      status: "success",
      email,
      userId,
      ticketUrl: `/sign-in?__clerk_ticket=${token}`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
