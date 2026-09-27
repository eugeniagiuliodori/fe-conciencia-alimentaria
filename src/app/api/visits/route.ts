import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { processVisit } from "@/features/visit-tracking/redis/process-visit";
import { verifyOwnerToken } from "@/lib/owner-token";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = await readRequestBody(request);

  if (body === null || !isValidUuid(body.uuid)) {
    return NextResponse.json(
      { error: "Invalid visit UUID" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const ownerToken = cookieStore.get("owner")?.value;

  if (ownerToken && verifyOwnerToken(ownerToken)) {
    return NextResponse.json({
      status: "IGNORED_OWNER",
    });
  }

  try {
  while (true) {
    const result = await processVisit(body.uuid);

    switch (result.status) {
      case "PROCESSED":
        return NextResponse.json({
          status: "PROCESSED",
        });

      case "FAILED":
        /*
         * Redis recibió el intento y confirmó
         * explícitamente que el incremento falló.
         *
         * Reintentamos inmediatamente con el mismo UUID.
         * El límite vive en Redis: el intento 10 fallido
         * devuelve ABANDONED.
         */
        continue;

      case "ABANDONED":
        return NextResponse.json({
          status: "ABANDONED",
          attempts: result.attempts,
        });
    }
  }
} catch (error) {
  console.error(
    "Unable to determine Redis visit result",
    error,
  );

  /*
   * No hubo una respuesta utilizable de Redis.
   *
   * No sabemos si:
   * - la petición nunca llegó;
   * - quedó visitretry:{UUID};
   * - Redis incrementó y creó visit:{UUID},
   *   pero la respuesta no llegó a Next.
   *
   * Por eso NO hacemos retry inmediato.
   */
  return NextResponse.json(
    {
      error:
        "Unable to determine visit processing result",
    },
    { status: 503 },
  );
}
}

type VisitRequestBody = {
  uuid: string;
};

async function readRequestBody(
  request: Request,
): Promise<VisitRequestBody | null> {
  try {
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("uuid" in body) ||
      typeof body.uuid !== "string"
    ) {
      return null;
    }

    return {
      uuid: body.uuid,
    };
  } catch {
    return null;
  }
}

function isValidUuid(uuid: string): boolean {
  return UUID_V4_REGEX.test(uuid);
}