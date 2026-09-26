import { NextResponse } from "next/server";

import { createOwnerToken } from "@/lib/owner-token";

export async function POST(request: Request) {
  const ownerSecret = process.env.OWNER_SECRET;

  // Si no está configurado, el mecanismo owner queda deshabilitado.
  if (!ownerSecret) {
    return NextResponse.json(
      { error: "Owner mode is disabled" },
      { status: 404 },
    );
  }

  const body: unknown = await request.json();

  if (
    typeof body !== "object" ||
    body === null ||
    !("secret" in body) ||
    typeof body.secret !== "string" ||
    body.secret !== ownerSecret
  ) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 },
    );
  }

  const ownerToken = createOwnerToken();

  const response = NextResponse.json({ success: true });

  response.cookies.set("owner", ownerToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}