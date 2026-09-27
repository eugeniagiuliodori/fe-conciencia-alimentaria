import "server-only";

import { redis } from "./redis";
import { PROCESS_VISIT_SCRIPT } from "./process-visit-script";
import {
  getVisitKey,
  getVisitRetryKey,
  VISITS_COUNT_KEY,
} from "./visit-state";

const PROCESSED_TTL_SECONDS = 24 * 60 * 60;
const MAX_ATTEMPTS = 10;

export type ProcessVisitResult =
  | {
      status: "PROCESSED";
    }
  | {
      status: "FAILED";
      attempts: number;
    }
  | {
      status: "ABANDONED";
      attempts: number;
    };

export async function processVisit(
  uuid: string,
): Promise<ProcessVisitResult> {
  const now = Date.now();

  const result = await redis.eval(
    PROCESS_VISIT_SCRIPT,
    [
      getVisitKey(uuid),
      getVisitRetryKey(uuid),
      VISITS_COUNT_KEY,
      
    ],
    [
      now.toString(),
      PROCESSED_TTL_SECONDS.toString(),
      MAX_ATTEMPTS.toString(),
    ],
  );
  return parseProcessVisitResult(result);
}

function parseProcessVisitResult(
  result: unknown,
): ProcessVisitResult {
  if (
    Array.isArray(result) &&
    result.length === 1 &&
    result[0] === "PROCESSED"
  ) {
    return {
      status: "PROCESSED",
    };
  }

  if (
    Array.isArray(result) &&
    result.length === 2 &&
    result[0] === "FAILED"
  ) {
    const attempts = Number(result[1]);

    if (!Number.isSafeInteger(attempts)) {
      throw new Error("Redis returned an invalid visit result");
    }

    return {
      status: "FAILED",
      attempts,
    };
  }

  if (
    Array.isArray(result) &&
    result.length === 2 &&
    result[0] === "ABANDONED"
  ) {
    const attempts = Number(result[1]);

    if (!Number.isSafeInteger(attempts)) {
      throw new Error("Redis returned an invalid visit result");
    }

    return {
      status: "ABANDONED",
      attempts,
    };
  }

  throw new Error("Redis returned an unexpected visit result");
}