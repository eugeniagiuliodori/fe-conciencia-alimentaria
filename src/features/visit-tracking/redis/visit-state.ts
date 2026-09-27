import "server-only";

export const VISITS_COUNT_KEY = "visits:count";

export const VISIT_KEY_PREFIX = "visit:";
export const VISIT_RETRY_KEY_PREFIX = "visitretry:";
export const VISIT_RECOVERY_LAST_RUN_KEY =
  "visits:recovery:lastRun";

export const VISIT_RECOVERY_LOCK_KEY =
  "visits:recovery:lock";

export type RedisVisitRetryState = {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
};

export function getVisitKey(uuid: string): string {
  return `${VISIT_KEY_PREFIX}${uuid}`;
}

export function getVisitRetryKey(uuid: string): string {
  return `${VISIT_RETRY_KEY_PREFIX}${uuid}`;
}