import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextResponse } from "next/server";

import { processVisit } from "@/features/visit-tracking/redis/process-visit";
import { recoverVisit } from "@/features/visit-tracking/redis/recover-visit";
import {
  beginRecoverySweep,
  completeRecoverySweep,
  releaseRecoverySweep,
} from "@/features/visit-tracking/redis/recovery-sweep-guard";
import { redis } from "@/features/visit-tracking/redis/redis";
import { VISIT_RETRY_KEY_PREFIX } from "@/features/visit-tracking/redis/visit-state";

const SCAN_COUNT = 100;

async function handler() {
  const guard =
    await beginRecoverySweep();

  if (guard.status === "NOT_DUE") {
    return NextResponse.json({
      status: "NOT_DUE",
    });
  }

  if (guard.status === "LOCKED") {
    return NextResponse.json({
      status: "LOCKED",
    });
  }

  const { lockToken } = guard;

  let cursor = "0";

  const summary = {
    scanned: 0,
    retried: 0,
    processed: 0,
    deleted: 0,
    abandoned: 0,
    notFound: 0,
    invalid: 0,
    uncertain: 0,
  };

  try {
    do {
      const [nextCursor, keys] =
        await redis.scan(cursor, {
          match: `${VISIT_RETRY_KEY_PREFIX}*`,
          count: SCAN_COUNT,
          type: "hash",
        });

      cursor = nextCursor;

      for (const key of keys) {
        summary.scanned += 1;

        const uuid = key.slice(
          VISIT_RETRY_KEY_PREFIX.length,
        );

        try {
          const recovery =
            await recoverVisit(uuid);

          switch (recovery.status) {
            case "DELETED":
              summary.deleted += 1;
              continue;

            case "NOT_FOUND":
              summary.notFound += 1;
              continue;

            case "INVALID":
              summary.invalid += 1;
              continue;

            case "RETRY":
              summary.retried += 1;
              break;
          }

          while (true) {
            const result =
              await processVisit(uuid);

            switch (result.status) {
              case "PROCESSED":
                summary.processed += 1;
                break;

              case "FAILED":
                continue;

              case "ABANDONED":
                summary.abandoned += 1;
                break;
            }

            break;
          }
        } catch (error) {
          summary.uncertain += 1;

          console.error(
            `Visit recovery result is uncertain for ${uuid}:`,
            error,
          );
        }
      }
    } while (cursor !== "0");

    /*
     * Sólo después de completar el sweep:
     * - actualizamos lastRun;
     * - liberamos el lock.
     */
    await completeRecoverySweep(
      lockToken,
    );

    return NextResponse.json({
      status: "COMPLETED",
      ...summary,
    });
  } catch (error) {
    /*
     * El sweep global no terminó.
     *
     * No actualizamos lastRun,
     * por lo que una llamada futura
     * podrá volver a intentarlo.
     */
    try {
      await releaseRecoverySweep(
        lockToken,
      );
    } catch (releaseError) {
      console.error(
        "Unable to release recovery lock:",
        releaseError,
      );
    }

    console.error(
      "Visit recovery sweep failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Visit recovery sweep failed",
      },
      {
        status: 500,
      },
    );
  }
}

export const POST =
  verifySignatureAppRouter(handler);