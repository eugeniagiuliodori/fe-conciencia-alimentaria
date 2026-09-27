export type RegisterVisitResult =
  | {
      status: "PROCESSED";
    }
  | {
      status: "IGNORED_OWNER";
    }
  | {
      status: "ABANDONED";
      attempts: number;
    };

export async function registerVisit(
  uuid: string,
): Promise<RegisterVisitResult> {
  const response = await fetch("/api/visits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ uuid }),
  });

  if (!response.ok) {
    throw new Error(
      `Visit registration failed with status ${response.status}`,
    );
  }

  const result: unknown = await response.json();

  return parseRegisterVisitResult(result);
}

function parseRegisterVisitResult(
  result: unknown,
): RegisterVisitResult {
  if (
    typeof result !== "object" ||
    result === null ||
    !("status" in result) ||
    typeof result.status !== "string"
  ) {
    throw new Error("Invalid visit registration response");
  }

  if (result.status === "PROCESSED") {
    return {
      status: "PROCESSED",
    };
  }

  if (result.status === "IGNORED_OWNER") {
    return {
      status: "IGNORED_OWNER",
    };
  }

  if (
    result.status === "ABANDONED" &&
    "attempts" in result &&
    typeof result.attempts === "number" &&
    Number.isSafeInteger(result.attempts)
  ) {
    return {
      status: "ABANDONED",
      attempts: result.attempts,
    };
  }

  throw new Error("Invalid visit registration response");
}