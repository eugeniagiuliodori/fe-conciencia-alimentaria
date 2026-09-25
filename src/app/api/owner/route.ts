import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const ownerSecret = process.env.OWNER_SECRET;

  if (!ownerSecret) {
    return NextResponse.json(
      { error: "Owner mode is disabled" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const secret = body.secret;

  if (typeof secret !== "string" || secret !== ownerSecret) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  const cookieStore = await cookies();

  cookieStore.set("owner", "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ success: true });
}