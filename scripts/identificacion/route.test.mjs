import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../../src/app/api/usuarios/identificacion/route.ts";

const originalBackendUrl = process.env.BACKEND_URL;
const validBody = JSON.stringify({ email: " Persona@Example.COM " });
const privateDiagnostic = JSON.stringify({
  email: "Persona@Example.COM",
  usuarioId: "synthetic-user-id",
  backend: "http://backend.test:8080",
  sql: "SELECT email FROM Usuario",
  stack: "java.lang.IllegalStateException at IdentificacionService.java:42",
  password: "synthetic-secret",
});

beforeEach((t) => {
  process.env.BACKEND_URL = "http://backend.test:8080";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected upstream call in a controlled test");
  });
});

afterEach(() => {
  if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalBackendUrl;
});

function request(body = validBody, headers = {}, url = "http://frontend.test/api/usuarios/identificacion") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

async function assertError(response, status, codigo) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  assert.equal(body.codigo, codigo);
  assert.equal(typeof body.mensaje, "string");
  assert.ok(body.mensaje.trim().length > 0);
  const publicResponse = JSON.stringify({ headers: Object.fromEntries(response.headers), body });
  assert.doesNotMatch(publicResponse, /synthetic-secret|synthetic-user-id|usuarioId|backend\.test|Persona@|SELECT|Usuario|java\.lang|IdentificacionService|password|stack/);
}

test("primer envío y repetición reciben el mismo 204 vacío del upstream simulado", async (t) => {
  const upstreamFetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "http://backend.test:8080/api/usuarios/identificacion");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { email: "Persona@Example.COM" });
    assert.deepEqual(options.headers, {
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, {
      status: 204,
      headers: {
        "Set-Cookie": "identity=synthetic-secret",
        "X-User-Id": "synthetic-secret",
        "X-Backend-Token": "synthetic-secret",
        "Retry-After": "60",
      },
    });
  });
  for (const contentType of ["Application/JSON; charset=utf-8", 'application/json; charset="UTF-8"']) {
    const before = upstreamFetch.mock.callCount();
    const response = await POST(request(validBody, {
      "Content-Type": contentType,
      Cookie: "identity=synthetic-secret",
      Authorization: "Bearer synthetic-secret",
      "X-Forwarded-For": "192.0.2.1",
      "X-Backend-Url": "http://untrusted.test",
      Host: "untrusted.test",
    }, "http://frontend.test/api/usuarios/identificacion?url=http://untrusted.test"));

    assert.equal(upstreamFetch.mock.callCount(), before + 1);
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assert.equal(await response.text(), "");
    assert.deepEqual(Object.fromEntries(response.headers), { "cache-control": "no-store" });
  }
});

test("rechaza cuerpo ausente o malformado, tipos incorrectos, email inválido y propiedades extra", async () => {
  const invalidBodies = [
    null, "", " ", "{", "null", "[]", '"texto"', "123", "true", "{}",
    JSON.stringify({ email: null }),
    JSON.stringify({ email: 1 }),
    JSON.stringify({ email: false }),
    JSON.stringify({ email: {} }),
    JSON.stringify({ email: ["persona@example.com"] }),
    JSON.stringify({ email: "" }),
    JSON.stringify({ email: "   " }),
    JSON.stringify({ email: "sin-arroba" }),
    JSON.stringify({ email: "a@@example.com" }),
    JSON.stringify({ email: "a b@example.com" }),
    JSON.stringify({ email: "a".repeat(243) + "@example.com" }),
    JSON.stringify({ email: "persona@example.com", usuarioId: "synthetic-secret" }),
    '{"email":"persona@example.com","__proto__":{}}',
  ];
  for (const body of invalidBodies) {
    await assertError(await POST(request(body)), 400, "SOLICITUD_INVALIDA");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("rechaza caracteres de control dentro del correo antes de consultar el upstream", async () => {
  for (const control of ["\u0000", "\u001b", "\u007f", "\u0085"]) {
    for (const email of [`persona${control}@example.test`, `persona@exam${control}ple.test`]) {
      await assertError(await POST(request(JSON.stringify({ email }))), 400, "SOLICITUD_INVALIDA");
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("requiere application/json antes de consultar el backend", async () => {
  for (const type of ["", "text/plain", "application/x-www-form-urlencoded", "application/ld+json"]) {
    await assertError(await POST(request(validBody, { "Content-Type": type })), 415, "TIPO_CONTENIDO_NO_ADMITIDO");
  }
  const withoutType = request(new TextEncoder().encode(validBody));
  withoutType.headers.delete("Content-Type");
  await assertError(await POST(withoutType), 415, "TIPO_CONTENIDO_NO_ADMITIDO");
  assert.equal(fetch.mock.callCount(), 0);
});

test("controla Content-Length antes de leer el cuerpo", async () => {
  let reads = 0;
  const body = new ReadableStream({
    pull() { reads += 1; },
  }, { highWaterMark: 0 });
  const incoming = new Request("http://frontend.test/api/usuarios/identificacion", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "2049" },
    body,
    duplex: "half",
  });
  await assertError(await POST(incoming), 413, "SOLICITUD_DEMASIADO_GRANDE");
  assert.equal(reads, 0);
  await incoming.body.cancel();
  for (const length of ["-1", "unknown", "1.5"]) {
    await assertError(await POST(request(validBody, { "Content-Length": length })), 400, "SOLICITUD_INVALIDA");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("acepta exactamente 2048 bytes y 254 caracteres de email tras recortar espacios", async (t) => {
  const email = "a".repeat(242) + "@example.com";
  const json = JSON.stringify({ email: ` ${email} ` });
  const body = json.padEnd(2048, " ");
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).email, email);
    return new Response(null, { status: 204 });
  });
  for (const headers of [{}, { "Content-Length": "2048" }]) {
    assert.equal((await POST(request(body, headers))).status, 204);
  }
});

test("limita bytes reales sin Content-Length o con una longitud declarada menor", async () => {
  const body = JSON.stringify({ email: "é".repeat(1100) });
  assert.ok(body.length < 2048);
  assert.ok(Buffer.byteLength(body) > 2048);
  for (const headers of [{}, { "Content-Length": "10" }]) {
    await assertError(await POST(request(body, headers)), 413, "SOLICITUD_DEMASIADO_GRANDE");
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("interrumpe y cancela la lectura en cuanto el stream supera el límite", async () => {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      reads += 1;
      controller.enqueue(new Uint8Array(1025));
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const incoming = new Request("http://frontend.test/api/usuarios/identificacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  });
  await assertError(await POST(incoming), 413, "SOLICITUD_DEMASIADO_GRANDE");
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
  assert.equal(fetch.mock.callCount(), 0);
});

test("rechaza UTF-8 inválido y errores de lectura sin exponer su diagnóstico", async () => {
  await assertError(await POST(request(new Uint8Array([0xc3, 0x28]))), 400, "SOLICITUD_INVALIDA");
  const body = new ReadableStream({
    start(controller) { controller.error(new Error("synthetic-secret")); },
  });
  const incoming = new Request("http://frontend.test/api/usuarios/identificacion", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half",
  });
  await assertError(await POST(incoming), 400, "SOLICITUD_INVALIDA");
  assert.equal(fetch.mock.callCount(), 0);
});

test("mapea 400, 413 y 415 sin copiar cuerpos ni encabezados arbitrarios del upstream", async (t) => {
  for (const [status, codigo] of [[400, "SOLICITUD_INVALIDA"], [413, "SOLICITUD_DEMASIADO_GRANDE"], [415, "TIPO_CONTENIDO_NO_ADMITIDO"]]) {
    t.mock.method(globalThis, "fetch", async () => new Response(privateDiagnostic, {
      status,
      headers: { "Set-Cookie": "identity=synthetic-secret", "Retry-After": "60", "X-Backend-Token": "synthetic-secret" },
    }));
    const response = await POST(request());
    assert.equal(response.headers.get("retry-after"), null);
    assert.equal(response.headers.get("x-backend-token"), null);
    await assertError(response, status, codigo);
    assert.equal(fetch.mock.callCount(), 1);
  }
});

test("429 conserva solo Retry-After expresado en segundos enteros positivos válidos", async (t) => {
  for (const [value, expected] of [
    ["60", "60"], ["0002", "2"], [null, null], ["0", null], ["-1", null],
    ["1.5", null], ["1e2", null], ["soon", null], ["9007199254740992", null],
    ["Thu, 15 Oct 2026 12:00:00 GMT", null],
  ]) {
    t.mock.method(globalThis, "fetch", async () => new Response("synthetic-secret", {
      status: 429, headers: value === null ? {} : { "Retry-After": value },
    }));
    const response = await POST(request());
    assert.equal(response.headers.get("retry-after"), expected);
    await assertError(response, 429, "DEMASIADAS_SOLICITUDES");
    assert.equal(fetch.mock.callCount(), 1);
  }
});

test("5xx, redirecciones y éxitos distintos de 204 nunca se presentan como éxito", async (t) => {
  for (const status of [200, 201, 301, 302, 307, 308, 401, 404, 500, 502, 503, 504]) {
    t.mock.method(globalThis, "fetch", async () => new Response(privateDiagnostic, {
      status, headers: { Location: "http://untrusted.test", "Set-Cookie": "identity=synthetic-secret" },
    }));
    const response = await POST(request());
    assert.equal(response.headers.get("location"), null);
    await assertError(response, 502, "SERVICIO_NO_DISPONIBLE");
    assert.equal(fetch.mock.callCount(), 1);
  }
});

test("descarta un cuerpo upstream incompleto sin leerlo ni esperar su cancelación", { timeout: 1000 }, async (t) => {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream({
    // Simula un servicio que envió las cabeceras pero nunca termina el cuerpo.
    pull() { reads += 1; },
    cancel() {
      cancelled = true;
      return new Promise(() => {});
    },
  }, { highWaterMark: 0 });
  t.mock.method(globalThis, "fetch", async () => new Response(body, { status: 500 }));

  await assertError(await POST(request()), 502, "SERVICIO_NO_DISPONIBLE");
  assert.equal(reads, 0);
  assert.equal(cancelled, true);
  assert.equal(fetch.mock.callCount(), 1);
});

test("fallo de red devuelve 502 sin logs, IDs ni secretos", async (t) => {
  const logs = ["log", "error", "warn"].map((method) => t.mock.method(console, method));
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(privateDiagnostic);
  });
  await assertError(await POST(request()), 502, "SERVICIO_NO_DISPONIBLE");
  assert.equal(fetch.mock.callCount(), 1);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("una pérdida de respuesta no afirma que el backend no procesó la operación", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("synthetic-secret: connection lost after accepting the request");
  });
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).mensaje, /No se pudo confirmar/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("el timeout de 5 segundos aborta el fetch y devuelve 504", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 5000);
    return controller.signal;
  });
  t.mock.method(globalThis, "fetch", async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    queueMicrotask(() => controller.abort(new DOMException("synthetic-secret", "TimeoutError")));
  }));
  await assertError(await POST(request()), 504, "TIEMPO_DE_ESPERA_AGOTADO");
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(controller.signal.aborted, true);
});

test("BACKEND_URL ausente o inválida devuelve 503 sin buscar otro destino", async () => {
  for (const value of [
    undefined, "", " ", "invalid", "file:///tmp/backend", "ftp://backend.test",
    "http://user:synthetic-secret@backend.test", "http://backend.test/context",
    "http://backend.test?key=synthetic-secret", "http://backend.test/#synthetic-secret",
  ]) {
    if (value === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = value;
    await assertError(await POST(request()), 503, "SERVICIO_NO_DISPONIBLE");
  }
  assert.equal(fetch.mock.callCount(), 0);
});
