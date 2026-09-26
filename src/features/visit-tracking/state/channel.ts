import {
  readTabVisitState,
  restoreTabVisitState,
  wasOperationApplied,
  writeTabVisitState,
  type TabVisitState,
} from "@/features/visit-tracking/state/ storage";

type StateRequestMessage = {
  type: "STATE_REQUEST";
  operationId: string;
  requestId: string;
};

type ApplyStateMessage = {
  type: "APPLY_STATE";
  operationId: string;
  requestId: string;
  uuid: string;
};

type RollbackStateMessage = {
  type: "ROLLBACK_STATE";
  operationId: string;
  requestId: string;
  previousState: TabVisitState;
};

type WorkerRequestMessage =
  | StateRequestMessage
  | ApplyStateMessage
  | RollbackStateMessage;

let initialized = false;

export function initializeVisitChannel(): void {
  if (initialized) return;
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener(
    "message",
    handleWorkerMessage,
  );

  initialized = true;
}

function handleWorkerMessage(
  event: MessageEvent<unknown>,
): void {
  const message = event.data;

  if (!isWorkerRequestMessage(message)) {
    return;
  }

  const worker = getSourceWorker(event);

  if (!worker) {
    return;
  }

  switch (message.type) {
    case "STATE_REQUEST":
      handleStateRequest(message, worker);
      break;

    case "APPLY_STATE":
      handleApplyState(message, worker);
      break;

    case "ROLLBACK_STATE":
      handleRollbackState(message, worker);
      break;
  }
}

function handleStateRequest(
  message: StateRequestMessage,
  worker: ServiceWorker,
): void {
  const state = readTabVisitState();

  worker.postMessage({
    type: "STATE_RESPONSE",
    operationId: message.operationId,
    requestId: message.requestId,
    state,
  });
}

function handleApplyState(
  message: ApplyStateMessage,
  worker: ServiceWorker,
): void {
  const currentState = readTabVisitState();

  writeTabVisitState({
    uuid: message.uuid,

    // lastActive pertenece exclusivamente
    // a esta pestaña.
    lastActive:
      currentState.lastActive ??
      Date.now(),

    operationId: message.operationId,
  });

  worker.postMessage({
    type: "APPLY_ACK",
    operationId: message.operationId,
    requestId: message.requestId,
  });
}

function handleRollbackState(
  message: RollbackStateMessage,
  worker: ServiceWorker,
): void {
  if (wasOperationApplied(message.operationId)) {
    const currentState = readTabVisitState();

    restoreTabVisitState({
      ...message.previousState,

      // lastActive pertenece a la pestaña y puede
      // haber cambiado mientras la transacción
      // estaba en curso.
      lastActive: currentState.lastActive,
    });
  }

  worker.postMessage({
    type: "ROLLBACK_ACK",
    operationId: message.operationId,
    requestId: message.requestId,
  });
}

function getSourceWorker(
  event: MessageEvent<unknown>,
): ServiceWorker | null {
  const source = event.source;

  if (
    typeof ServiceWorker === "undefined" ||
    !(source instanceof ServiceWorker)
  ) {
    return null;
  }

  return source;
}

function isWorkerRequestMessage(
  value: unknown,
): value is WorkerRequestMessage {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const message =
    value as Record<string, unknown>;

  if (
    typeof message.type !== "string" ||
    typeof message.operationId !== "string" ||
    typeof message.requestId !== "string"
  ) {
    return false;
  }

  switch (message.type) {
    case "STATE_REQUEST":
      return true;

    case "APPLY_STATE":
      return typeof message.uuid === "string";

    case "ROLLBACK_STATE":
      return isTabVisitState(
        message.previousState,
      );

    default:
      return false;
  }
}

function isTabVisitState(
  value: unknown,
): value is TabVisitState {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const state =
    value as Record<string, unknown>;

  const validUuid =
    state.uuid === null ||
    typeof state.uuid === "string";

  const validLastActive =
    state.lastActive === null ||
    (
      typeof state.lastActive === "number" &&
      Number.isFinite(state.lastActive)
    );

  const validOperationId =
    state.operationId === null ||
    typeof state.operationId === "string";

  return (
    validUuid &&
    validLastActive &&
    validOperationId
  );
}