const VISIT_STATE_KEY = "visit:state";

export type TabVisitState = {
  uuid: string | null;
  lastActive: number | null;
  operationId: string | null;
};

type ActiveTabVisitState = {
  uuid: string;
  lastActive: number;
  operationId: string;
};

const EMPTY_TAB_VISIT_STATE: TabVisitState = {
  uuid: null,
  lastActive: null,
  operationId: null,
};

export function readTabVisitState(): TabVisitState {
  const storedState =
    sessionStorage.getItem(VISIT_STATE_KEY);

  if (storedState === null) {
    return { ...EMPTY_TAB_VISIT_STATE };
  }

  try {
    const parsedState: unknown =
      JSON.parse(storedState);

    if (!isTabVisitState(parsedState)) {
      return { ...EMPTY_TAB_VISIT_STATE };
    }

    return parsedState;
  } catch {
    return { ...EMPTY_TAB_VISIT_STATE };
  }
}

export function writeTabVisitState(
  state: ActiveTabVisitState,
): void {
  sessionStorage.setItem(
    VISIT_STATE_KEY,
    JSON.stringify(state),
  );
}

export function updateLastActive(
  lastActive: number = Date.now(),
): void {
  const currentState = readTabVisitState();

  sessionStorage.setItem(
    VISIT_STATE_KEY,
    JSON.stringify({
      ...currentState,
      lastActive,
    }),
  );
}

export function restoreTabVisitState(
  state: TabVisitState,
): void {
  if (isEmptyTabVisitState(state)) {
    sessionStorage.removeItem(VISIT_STATE_KEY);
    return;
  }

  sessionStorage.setItem(
    VISIT_STATE_KEY,
    JSON.stringify(state),
  );
}

export function wasOperationApplied(
  operationId: string,
): boolean {
  const state = readTabVisitState();

  return state.operationId === operationId;
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

function isEmptyTabVisitState(
  state: TabVisitState,
): boolean {
  return (
    state.uuid === null &&
    state.lastActive === null &&
    state.operationId === null
  );
}