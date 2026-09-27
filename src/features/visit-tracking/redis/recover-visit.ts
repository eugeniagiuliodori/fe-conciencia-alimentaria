import "server-only";

import { redis } from "./redis";
import { RECOVER_VISIT_SCRIPT } from "./recover-visit-script";
import { getVisitRetryKey } from "./visit-state";

const STALE_AFTER_MS =
  7 * 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 10;

export type RecoverVisitResult =
  | {
      status: "RETRY";
      attempts: number;
    }
  | {
      status: "DELETED";
      attempts: number;
    }
  | {
      status: "NOT_FOUND";
    }
  | {
      status: "INVALID";
    };

export async function recoverVisit(
  uuid: string,
): Promise<RecoverVisitResult> {
  const now = Date.now();

  const result = await redis.eval(
    RECOVER_VISIT_SCRIPT,
    [getVisitRetryKey(uuid)],
    [
      now.toString(),
      STALE_AFTER_MS.toString(),
      MAX_ATTEMPTS.toString(),
    ],
  );

  return parseRecoverVisitResult(result);
}

function parseRecoverVisitResult(
  result: unknown,
): RecoverVisitResult {
  if (
    Array.isArray(result) &&
    result.length === 1 &&
    result[0] === "NOT_FOUND"
  ) {
    return {
      status: "NOT_FOUND",
    };
  }

  if (
    Array.isArray(result) &&
    result.length === 1 &&
    result[0] === "INVALID"
  ) {
    return {
      status: "INVALID",
    };
  }

  if (
    Array.isArray(result) &&
    result.length === 2 &&
    result[0] === "RETRY"
  ) {
    const attempts = Number(result[1]);

    if (!isValidAttempts(attempts)) {
      throw new Error(
        "Redis returned an invalid recovery result",
      );
    }

    return {
      status: "RETRY",
      attempts,
    };
  }

  if (
    Array.isArray(result) &&
    result.length === 2 &&
    result[0] === "DELETED"
  ) {
    const attempts = Number(result[1]);

    if (!isValidAttempts(attempts)) {
      throw new Error(
        "Redis returned an invalid recovery result",
      );
    }

    return {
      status: "DELETED",
      attempts,
    };
  }

  throw new Error(
    "Redis returned an unexpected recovery result",
  );
}

function isValidAttempts(
  attempts: number,
): boolean {
  return (
    Number.isSafeInteger(attempts) &&
    attempts >= 1
  );
}