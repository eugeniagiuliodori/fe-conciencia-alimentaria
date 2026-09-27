import "server-only";

import { randomUUID } from "node:crypto";

import { redis } from "./redis";
import {
  VISIT_RECOVERY_LAST_RUN_KEY,
  VISIT_RECOVERY_LOCK_KEY,
} from "./visit-state";

const RECOVERY_INTERVAL_MS =
  8 * 24 * 60 * 60 * 1000;

const RECOVERY_LOCK_TTL_MS =
  15 * 60 * 1000;

const BEGIN_RECOVERY_SCRIPT = `
local lastRunKey = KEYS[1]
local lockKey = KEYS[2]

local now = tonumber(ARGV[1])
local intervalMs = tonumber(ARGV[2])
local lockTtlMs = tonumber(ARGV[3])
local lockToken = ARGV[4]

local lastRunRaw =
  redis.call("GET", lastRunKey)

if lastRunRaw then
  local lastRun = tonumber(lastRunRaw)

  if lastRun
    and now - lastRun < intervalMs
  then
    return { "NOT_DUE" }
  end
end

local lockResult =
  redis.call(
    "SET",
    lockKey,
    lockToken,
    "NX",
    "PX",
    lockTtlMs
  )

if not lockResult then
  return { "LOCKED" }
end

return { "RUN" }
`;

const COMPLETE_RECOVERY_SCRIPT = `
local lastRunKey = KEYS[1]
local lockKey = KEYS[2]

local completedAt = ARGV[1]
local lockToken = ARGV[2]

local currentToken =
  redis.call("GET", lockKey)

if currentToken ~= lockToken then
  return { "LOCK_LOST" }
end

redis.call(
  "SET",
  lastRunKey,
  completedAt
)

redis.call(
  "DEL",
  lockKey
)

return { "COMPLETED" }
`;

const RELEASE_RECOVERY_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local lockToken = ARGV[1]

local currentToken =
  redis.call("GET", lockKey)

if currentToken == lockToken then
  redis.call("DEL", lockKey)
  return 1
end

return 0
`;

export type BeginRecoverySweepResult =
  | {
      status: "RUN";
      lockToken: string;
    }
  | {
      status: "NOT_DUE";
    }
  | {
      status: "LOCKED";
    };

export async function beginRecoverySweep():
  Promise<BeginRecoverySweepResult> {
  const now = Date.now();
  const lockToken = randomUUID();

  const result = await redis.eval(
    BEGIN_RECOVERY_SCRIPT,
    [
      VISIT_RECOVERY_LAST_RUN_KEY,
      VISIT_RECOVERY_LOCK_KEY,
    ],
    [
      now.toString(),
      RECOVERY_INTERVAL_MS.toString(),
      RECOVERY_LOCK_TTL_MS.toString(),
      lockToken,
    ],
  );

  if (
    Array.isArray(result) &&
    result[0] === "RUN"
  ) {
    return {
      status: "RUN",
      lockToken,
    };
  }

  if (
    Array.isArray(result) &&
    result[0] === "NOT_DUE"
  ) {
    return {
      status: "NOT_DUE",
    };
  }

  if (
    Array.isArray(result) &&
    result[0] === "LOCKED"
  ) {
    return {
      status: "LOCKED",
    };
  }

  throw new Error(
    "Redis returned an unexpected recovery guard result",
  );
}

export async function completeRecoverySweep(
  lockToken: string,
): Promise<void> {
  const result = await redis.eval(
    COMPLETE_RECOVERY_SCRIPT,
    [
      VISIT_RECOVERY_LAST_RUN_KEY,
      VISIT_RECOVERY_LOCK_KEY,
    ],
    [
      Date.now().toString(),
      lockToken,
    ],
  );

  if (
    !Array.isArray(result) ||
    result[0] !== "COMPLETED"
  ) {
    throw new Error(
      "Unable to complete recovery sweep",
    );
  }
}

export async function releaseRecoverySweep(
  lockToken: string,
): Promise<void> {
  await redis.eval(
    RELEASE_RECOVERY_LOCK_SCRIPT,
    [VISIT_RECOVERY_LOCK_KEY],
    [lockToken],
  );
}