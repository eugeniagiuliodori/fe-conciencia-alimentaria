import { initializeVisitChannel } from "./state/channel";

const VISIT_WORKER_URL = "/visit-worker.js";
const VISIT_WORKER_SCOPE = "/";
const DECISION_TIMEOUT_MS = 10_000;

export type VisitSession = {
  uuid: string;
  isNewVisit: boolean;
};

type VisitDecisionMessage = {
  type: "VISIT_DECISION";
  operationId: string;
  decision: VisitSession;
};

type VisitDecisionFailedMessage = {
  type: "VISIT_DECISION_FAILED";
  operationId: string;
  reason: string;
};

let initializationPromise:
  Promise<ServiceWorker> | null = null;

let determinationPromise:
  Promise<VisitSession> | null = null;

export function determineVisitSession():
  Promise<VisitSession> {
  if (determinationPromise) {
    return determinationPromise;
  }

  determinationPromise =
    determineVisitSessionInternal();

  void determinationPromise.finally(() => {
    determinationPromise = null;
  });

  return determinationPromise;
}

async function determineVisitSessionInternal():
  Promise<VisitSession> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    throw new Error(
      "Service Worker is not available",
    );
  }

  const worker =
    await initializeVisitWorker();

  return requestVisitDecision(worker);
}

function initializeVisitWorker():
  Promise<ServiceWorker> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise =
    initializeVisitWorkerInternal();

  void initializationPromise.catch(() => {
    initializationPromise = null;
  });

  return initializationPromise;
}

async function initializeVisitWorkerInternal():
  Promise<ServiceWorker> {
  initializeVisitChannel();

  await navigator.serviceWorker.register(
    VISIT_WORKER_URL,
    {
      scope: VISIT_WORKER_SCOPE,
    },
  );

  const registration =
    await navigator.serviceWorker.ready;

  const worker =
    registration.active;

  if (!worker) {
    throw new Error(
      "Visit Service Worker is not active",
    );
  }

  return worker;
}

function requestVisitDecision(
  worker: ServiceWorker,
): Promise<VisitSession> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = window.setTimeout(
      () => {
        finishWithError(
          new Error(
            "Visit decision timed out",
          ),
        );
      },
      DECISION_TIMEOUT_MS,
    );

    function handleMessage(
      event: MessageEvent<unknown>,
    ): void {
      const message = event.data;

      if (
        isVisitDecisionMessage(message)
      ) {
        finishWithSuccess(
          message.decision,
        );

        return;
      }

      if (
        isVisitDecisionFailedMessage(
          message,
        )
      ) {
        finishWithError(
          new Error(
            `Visit decision failed: ${message.reason}`,
          ),
        );
      }
    }

    function finishWithSuccess(
      session: VisitSession,
    ): void {
      if (settled) return;

      settled = true;

      cleanup();

      resolve(session);
    }

    function finishWithError(
      error: Error,
    ): void {
      if (settled) return;

      settled = true;

      cleanup();

      reject(error);
    }

    function cleanup(): void {
      window.clearTimeout(timeoutId);

      navigator.serviceWorker.removeEventListener(
        "message",
        handleMessage,
      );
    }

    navigator.serviceWorker.addEventListener(
      "message",
      handleMessage,
    );

    worker.postMessage({
      type: "DETERMINE_VISIT",
    });
  });
}

function isVisitDecisionMessage(
  value: unknown,
): value is VisitDecisionMessage {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const message =
    value as Record<string, unknown>;

  return (
    message.type === "VISIT_DECISION" &&
    typeof message.operationId ===
      "string" &&
    isVisitSession(message.decision)
  );
}

function isVisitDecisionFailedMessage(
  value: unknown,
): value is VisitDecisionFailedMessage {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const message =
    value as Record<string, unknown>;

  return (
    message.type ===
      "VISIT_DECISION_FAILED" &&
    typeof message.operationId ===
      "string" &&
    typeof message.reason === "string"
  );
}

function isVisitSession(
  value: unknown,
): value is VisitSession {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const session =
    value as Record<string, unknown>;

  return (
    typeof session.uuid === "string" &&
    session.uuid.length > 0 &&
    typeof session.isNewVisit ===
      "boolean"
  );
}