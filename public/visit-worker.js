const VISIT_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const RESPONSE_TIMEOUT_MS = 3000;

const LOCK_NAME = "visit-tracking:decision";

const DB_NAME = "visit-tracking";
const DB_VERSION = 1;
const JOURNAL_STORE = "journal";
const CURRENT_TRANSACTION_KEY = "current";

/*
 * Estado en memoria exclusivamente operativo.
 *
 * No constituye persistencia ni garantía de recovery.
 * Si el Service Worker se reinicia, esta información
 * desaparece y se reconstruye mediante IndexedDB.
 */
const pendingRequests = new Map();

/*
 * =========================================================
 * MENSAJES
 * =========================================================
 */

self.addEventListener("message", (event) => {
  const message = event.data;

  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "DETERMINE_VISIT") {
    const requestingClientId = event.source?.id;

    if (!requestingClientId) {
      return;
    }

    /*
     * El Web Lock define la sección crítica completa.
     *
     * El lock se libera solamente cuando runAtomicOperation()
     * termina.
     */
    const operation = navigator.locks.request(
      LOCK_NAME,
      { mode: "exclusive" },
      () =>
        runAtomicOperation(
          requestingClientId,
        ),
    );

    event.waitUntil(operation);

    return;
  }

  if (
    message.type === "STATE_RESPONSE" ||
    message.type === "APPLY_ACK" ||
    message.type === "ROLLBACK_ACK"
  ) {
    handleClientResponse(event);
  }
});

/*
 * =========================================================
 * BLOQUE ATÓMICO
 * =========================================================
 */

async function runAtomicOperation(
  requestingClientId,
) {
  /*
   * Antes de comenzar una operación nueva,
   * resolvemos cualquier transacción anterior
   * que haya quedado interrumpida.
   */
  await recoverInterruptedTransaction();

  const requestingClient =
    await self.clients.get(requestingClientId);

  if (!requestingClient) {
    return;
  }

  const operationId = crypto.randomUUID();

  /*
   * BEGIN durable.
   *
   * Todavía no se modificó ningún sessionStorage.
   */
  await writeJournal({
    key: CURRENT_TRANSACTION_KEY,
    operationId,
    status: "BEGIN",
    startedAt: Date.now(),
  });

  try {
    /*
     * Snapshot determinístico de los WindowClient
     * observables en este momento.
     */
    const clients =
      await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

    /*
     * El solicitante podría haber desaparecido
     * inmediatamente después del snapshot.
     */
    if (
      !clients.some(
        (client) =>
          client.id === requestingClientId,
      )
    ) {
      await abortJournal(operationId);
      return;
    }

    /*
     * Leemos el estado de TODOS los clientes
     * del snapshot, incluido el solicitante.
     */
    const collection =
      await collectClientStates(
        operationId,
        clients,
      );

    /*
     * El timeout no decide cuántos clientes existen.
     *
     * collectClientStates() revalida los clientes
     * faltantes antes de devolver el resultado.
     */
    const now = Date.now();

    const activeStates =
  collection.states.filter(
    ({ state }) =>
      isActiveVisitState(
        state,
        now,
      ),
  );

let uuid;
let isNewVisit;

if (activeStates.length > 0) {
  /*
   * Existe al menos una pestaña con actividad
   * dentro de las últimas 2 horas.
   *
   * Tomamos como referencia la pestaña cuya
   * actividad local sea la más reciente.
   */
  const mostRecent =
    activeStates.reduce(
      (latest, current) =>
        current.state.lastActive >
        latest.state.lastActive
          ? current
          : latest,
    );

  uuid = mostRecent.state.uuid;
  isNewVisit = false;
} else {
  /*
   * Ninguna de las pestañas que respondió
   * contiene evidencia de una visita vigente.
   *
   * Se genera un nuevo UUID.
   *
   * Esto incluye el caso excepcional en que
   * algún cliente vivo no respondió.
   */
  uuid = crypto.randomUUID();
  isNewVisit = true;
}

   

    /*
     * Guardamos qué estado tenía cada participante
     * ANTES de empezar a modificar sessionStorage.
     *
     * Ésta es la información necesaria para rollback.
     */
    const participants =
      collection.states.map(
        ({ clientId, state }) => ({
          clientId,
          previousState: state,
        }),
      );

    /*
     * PREPARED durable.
     *
     * Desde este punto puede comenzar la modificación
     * de los sessionStorage.
     */
    await writeJournal({
      key: CURRENT_TRANSACTION_KEY,

      operationId,

      status: "PREPARED",

      startedAt: now,

      decision: {
        uuid,
        isNewVisit,
      },

      participants,
    });

    /*
     * Aplicamos el nuevo estado solamente sobre
     * los participantes cuyo estado anterior
     * logramos conocer.
     *
     * Un cliente vivo que no respondió durante
     * la recopilación NO puede formar parte segura
     * de esta transacción porque no conocemos
     * previousState para rollback.
     */
   const applyResult =
  await applyStateToParticipants(
    operationId,
    participants,
    uuid,
  );

    /*
     * Para poder hacer COMMIT necesitamos que todos
     * los participantes que todavía son aplicables
     * hayan confirmado la escritura.
     */
    if (!applyResult.success) {
      await rollbackPreparedTransaction(
        operationId,
      );

      await notifyFailure(
        requestingClientId,
        operationId,
        "APPLY_FAILED",
      );

      return;
    }

    /*
     * COMMIT:
     *
     * Todos los efectos de aplicación requeridos
     * ya fueron realizados y confirmados.
     *
     * COMMITTED es el estado terminal exitoso.
     * No necesitamos COMPLETED.
     */
    await writeJournal({
      key: CURRENT_TRANSACTION_KEY,

      operationId,

      status: "COMMITTED",

      startedAt: now,
      committedAt: Date.now(),

      decision: {
  uuid,
  isNewVisit,
},

      participants,
    });

    /*
     * Sólo después del COMMIT comunicamos al
     * solicitante el resultado funcional.
     */
    const currentRequestingClient =
      await self.clients.get(
        requestingClientId,
      );

    if (currentRequestingClient) {
      currentRequestingClient.postMessage({
        type: "VISIT_DECISION",

        operationId,

        decision: {
  uuid,
  isNewVisit,
},

        diagnostics: {
          expectedClientCount:
            collection.expectedClientCount,

          receivedClientCount:
            collection.states.length,

          missingClientIds:
            collection.missingClientIds,

          timedOut:
            collection.timedOut,
        },
      });
    }
  } catch (error) {
    /*
     * Si seguimos ejecutándonos, intentamos recovery
     * inmediatamente.
     *
     * Si el Service Worker desapareció por completo,
     * este catch obviamente no puede ejecutarse;
     * el próximo evento recuperará el journal.
     */
    await recoverInterruptedTransaction();

    throw error;
  }
}

/*
 * =========================================================
 * RECOVERY
 * =========================================================
 */

async function recoverInterruptedTransaction() {
  const transaction =
    await readJournal();

  if (!transaction) {
    return;
  }

  /*
   * COMMITTED es terminal.
   *
   * Todos los efectos necesarios ya ocurrieron
   * antes del commit.
   */
  if (
    transaction.status === "COMMITTED" ||
    transaction.status === "ABORTED"
  ) {
    return;
  }

  /*
   * BEGIN significa que todavía no habíamos
   * comenzado a modificar sessionStorage.
   *
   * No hay efectos que revertir.
   */
  if (transaction.status === "BEGIN") {
    await abortJournal(
      transaction.operationId,
    );

    return;
  }

  /*
   * PREPARED significa que uno, varios o ninguno
   * de los participantes podría haber alcanzado
   * a aplicar el nuevo estado.
   *
   * No intentamos adivinar cuáles.
   *
   * Cada pestaña compara su operationId actual.
   */
  if (transaction.status === "PREPARED") {
    await rollbackPreparedTransaction(
      transaction.operationId,
    );
  }
}

async function rollbackPreparedTransaction(
  operationId,
) {
  const transaction =
    await readJournal();

  if (
    !transaction ||
    transaction.operationId !== operationId ||
    transaction.status !== "PREPARED"
  ) {
    return;
  }

  const participants =
    Array.isArray(transaction.participants)
      ? transaction.participants
      : [];

  const rollbackTargets = [];

  for (const participant of participants) {
    const client =
      await self.clients.get(
        participant.clientId,
      );

    /*
     * Si el Client.id original ya no existe,
     * su sessionStorage tampoco constituye un
     * efecto recuperable de esta transacción.
     */
    if (!client) {
      continue;
    }

    rollbackTargets.push({
      client,
      previousState:
        participant.previousState,
    });
  }

  if (rollbackTargets.length > 0) {
    const rollbackResult =
      await requestClientResponses({
        operationId,

        clients: rollbackTargets.map(
          ({ client }) => client,
        ),

        requestType: "ROLLBACK_STATE",

        expectedResponseType:
          "ROLLBACK_ACK",

        createMessage: (client) => {
          const target =
            rollbackTargets.find(
              ({ client: targetClient }) =>
                targetClient.id ===
                client.id,
            );

          return {
            type: "ROLLBACK_STATE",
            operationId,
            previousState:
              target.previousState,
          };
        },
      });

    /*
     * Si todavía existen participantes que deberían
     * responder pero no lo hicieron, NO declaramos
     * ABORTED.
     *
     * El journal permanece PREPARED para que otro
     * recovery pueda volver a intentarlo.
     */
    if (!rollbackResult.success) {
      throw new Error(
        `Rollback incomplete for operation ${operationId}`,
      );
    }
  }

  /*
   * Todos los efectos todavía aplicables quedaron
   * revertidos, o sus Client.id dejaron de existir.
   */
  await abortJournal(operationId);
}

/*
 * =========================================================
 * RECOPILACIÓN DE ESTADOS
 * =========================================================
 */

async function collectClientStates(
  operationId,
  clients,
) {
  if (clients.length === 0) {
    return {
      expectedClientCount: 0,
      states: [],
      missingClientIds: [],
      timedOut: false,
    };
  }

  const result =
    await requestClientResponses({
      operationId,
      clients,
      requestType: "STATE_REQUEST",
      expectedResponseType:
        "STATE_RESPONSE",

      createMessage: () => ({
        type: "STATE_REQUEST",
        operationId,
      }),
    });

  return {
    expectedClientCount:
      result.expectedClientCount,

    states: result.responses.map(
      ({ clientId, payload }) => ({
        clientId,
        state: payload.state,
      }),
    ),

    missingClientIds:
      result.missingClientIds,

    timedOut:
      result.timedOut,
  };
}

/*
 * =========================================================
 * APPLY
 * =========================================================
 */

async function applyStateToParticipants(
  operationId,
  participants,
  uuid,
) {
  const clients = [];

  for (const participant of participants) {
    const client =
      await self.clients.get(
        participant.clientId,
      );

    if (client) {
      clients.push(client);
    }
  }

  /*
   * Un participante que desapareció después de PREPARED
   * ya no posee un sessionStorage aplicable.
   *
   * Por eso no impide el commit.
   */
  if (clients.length === 0) {
    return {
      success: true,
    };
  }

  const result =
    await requestClientResponses({
      operationId,
      clients,

      requestType: "APPLY_STATE",
      expectedResponseType:
        "APPLY_ACK",

      /*
       * Sólo propagamos el UUID.
       *
       * lastActive pertenece al estado local
       * de cada pestaña y no debe propagarse.
       *
       * operationId ya forma parte del protocolo
       * de la operación.
       */
      createMessage: () => ({
        type: "APPLY_STATE",
        operationId,
        uuid,
      }),
    });

  return {
    success: result.success,
  };
}

/*
 * =========================================================
 * MECANISMO GENÉRICO REQUEST / RESPONSE
 * =========================================================
 */

function requestClientResponses({
  operationId,
  clients,
  requestType,
  expectedResponseType,
  createMessage,
}) {
  const requestId = crypto.randomUUID();

  const expectedClientIds =
    new Set(
      clients.map(
        (client) => client.id,
      ),
    );

  if (expectedClientIds.size === 0) {
    return Promise.resolve({
      expectedClientCount: 0,
      responses: [],
      missingClientIds: [],
      timedOut: false,
      success: true,
    });
  }

  return new Promise((resolve) => {
    const request = {
      operationId,
      requestType,
      expectedResponseType,
      expectedClientIds,
      responses: new Map(),
      resolve,
      timeoutId: null,
    };

    pendingRequests.set(
      requestId,
      request,
    );

    request.timeoutId = setTimeout(() => {
      void revalidatePendingRequest(
        requestId,
      );
    }, RESPONSE_TIMEOUT_MS);

    for (const client of clients) {
      client.postMessage({
        ...createMessage(client),
        requestId,
      });
    }
  });
}

function handleClientResponse(event) {
  const message = event.data;
  const client = event.source;

  if (
    !client?.id ||
    typeof message.requestId !== "string" ||
    typeof message.operationId !== "string"
  ) {
    return;
  }

  const request =
    pendingRequests.get(
      message.requestId,
    );

  if (!request) {
    return;
  }

  /*
   * La respuesta tiene que pertenecer:
   *
   * 1. al request concreto;
   * 2. al mismo bloque atómico;
   * 3. al tipo de respuesta esperado;
   * 4. a un Client.id del snapshot esperado.
   */
  if (
    message.operationId !==
      request.operationId ||
    message.type !==
      request.expectedResponseType ||
    !request.expectedClientIds.has(
      client.id,
    )
  ) {
    return;
  }

  /*
   * Para STATE_RESPONSE validamos también
   * el estado recibido.
   */
  if (
    message.type === "STATE_RESPONSE" &&
    !isTabVisitState(message.state)
  ) {
    return;
  }

  request.responses.set(
    client.id,
    {
      clientId: client.id,
      payload: message,
    },
  );

  if (
    request.responses.size ===
    request.expectedClientIds.size
  ) {
    finishPendingRequest(
      message.requestId,
      false,
    );
  }
}

async function revalidatePendingRequest(
  requestId,
) {
  const request =
    pendingRequests.get(requestId);

  if (!request) {
    return;
  }

  const missingClientIds = [
    ...request.expectedClientIds,
  ].filter(
    (clientId) =>
      !request.responses.has(clientId),
  );

  const results =
    await Promise.all(
      missingClientIds.map(
        async (clientId) => ({
          clientId,
          client:
            await self.clients.get(clientId),
        }),
      ),
    );

  /*
   * Los clientes que dejaron de existir
   * dejan también de ser respuestas esperables.
   */
  for (const {
    clientId,
    client,
  } of results) {
    if (!client) {
      request.expectedClientIds.delete(
        clientId,
      );
    }
  }

  if (
    request.responses.size ===
    request.expectedClientIds.size
  ) {
    finishPendingRequest(
      requestId,
      false,
    );

    return;
  }

  /*
   * Sigue existiendo al menos un cliente que
   * debería haber respondido pero no lo hizo.
   */
  finishPendingRequest(
    requestId,
    true,
  );
}

function finishPendingRequest(
  requestId,
  timedOut,
) {
  const request =
    pendingRequests.get(requestId);

  if (!request) {
    return;
  }

  if (request.timeoutId !== null) {
    clearTimeout(request.timeoutId);
  }

  pendingRequests.delete(requestId);

  const missingClientIds = [
    ...request.expectedClientIds,
  ].filter(
    (clientId) =>
      !request.responses.has(clientId),
  );

  request.resolve({
    expectedClientCount:
      request.expectedClientIds.size,

    responses: [
      ...request.responses.values(),
    ],

    missingClientIds,

    timedOut,

    success:
      missingClientIds.length === 0,
  });
}

/*
 * =========================================================
 * JOURNAL INDEXEDDB
 * =========================================================
 */

function openDatabase() {
  return new Promise(
    (resolve, reject) => {
      const request =
        indexedDB.open(
          DB_NAME,
          DB_VERSION,
        );

      request.onupgradeneeded = () => {
        const db = request.result;

        if (
          !db.objectStoreNames.contains(
            JOURNAL_STORE,
          )
        ) {
          db.createObjectStore(
            JOURNAL_STORE,
            {
              keyPath: "key",
            },
          );
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    },
  );
}

async function readJournal() {
  const db = await openDatabase();

  try {
    return await new Promise(
      (resolve, reject) => {
        const transaction =
          db.transaction(
            JOURNAL_STORE,
            "readonly",
          );

        const store =
          transaction.objectStore(
            JOURNAL_STORE,
          );

        const request =
          store.get(
            CURRENT_TRANSACTION_KEY,
          );

        request.onsuccess = () => {
          resolve(
            request.result ?? null,
          );
        };

        request.onerror = () => {
          reject(request.error);
        };
      },
    );
  } finally {
    db.close();
  }
}

async function writeJournal(record) {
  const db = await openDatabase();

  try {
    await new Promise(
      (resolve, reject) => {
        const transaction =
          db.transaction(
            JOURNAL_STORE,
            "readwrite",
          );

        const store =
          transaction.objectStore(
            JOURNAL_STORE,
          );

        store.put(record);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        transaction.onabort = () => {
          reject(
            transaction.error ??
              new Error(
                "Journal transaction aborted",
              ),
          );
        };
      },
    );
  } finally {
    db.close();
  }
}

async function abortJournal(
  operationId,
) {
  const current =
    await readJournal();

  if (
    !current ||
    current.operationId !== operationId
  ) {
    return;
  }

  await writeJournal({
    ...current,
    status: "ABORTED",
    abortedAt: Date.now(),
  });
}

/*
 * =========================================================
 * VALIDACIÓN
 * =========================================================
 */

function isTabVisitState(value) {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const validUuid =
    value.uuid === null ||
    typeof value.uuid === "string";

  const validLastActive =
    value.lastActive === null ||
    (
      typeof value.lastActive ===
        "number" &&
      Number.isFinite(
        value.lastActive,
      )
    );

  const validOperationId =
    value.operationId === null ||
    typeof value.operationId ===
      "string";

  return (
    validUuid &&
    validLastActive &&
    validOperationId
  );
}

function isActiveVisitState(
  state,
  now,
) {
  if (
    typeof state.uuid !== "string" ||
    state.uuid.length === 0 ||
    typeof state.lastActive !==
      "number" ||
    !Number.isFinite(
      state.lastActive,
    )
  ) {
    return false;
  }

  const elapsed =
    now - state.lastActive;

  return (
    elapsed >= 0 &&
    elapsed < VISIT_TIMEOUT_MS
  );
}

/*
 * =========================================================
 * ERROR AL SOLICITANTE
 * =========================================================
 */

async function notifyFailure(
  clientId,
  operationId,
  reason,
) {
  const client =
    await self.clients.get(clientId);

  if (!client) {
    return;
  }

  client.postMessage({
    type: "VISIT_DECISION_FAILED",
    operationId,
    reason,
  });
}