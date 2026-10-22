import assert from "node:assert/strict";
import Module from "node:module";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

// Next resuelve server-only durante el empaquetado; estos tests ejecutan el
// servicio directamente en Node, sin habilitar su uso desde componentes cliente.
Module.register(new URL("./server-only-test-loader.mjs", import.meta.url));
const unregisterTsx = register({ tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)) });
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (specifier, ...args) {
  if (specifier === "@/services/sesiones-declarativas") {
    specifier = fileURLToPath(new URL("../../src/services/sesiones-declarativas.ts", import.meta.url));
  } else if (specifier === "server-only") {
    specifier = fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url));
  }
  return originalResolveFilename.call(this, specifier, ...args);
};
assert.equal(import.meta.resolve("server-only"), new URL("./server-only-test-stub.cjs", import.meta.url).href);
const [{ NextRequest }, { POST }, { DELETE }] = await Promise.all([
  import("next/server.js"),
  import("../../src/app/api/usuarios/sesiones/route.ts"),
  import("../../src/app/api/usuarios/sesiones/actual/route.ts"),
]).finally(() => {
  Module._resolveFilename = originalResolveFilename;
});

const original = Object.fromEntries(
  ["BACKEND_URL", "BFF_SERVICE_SECRET", "NODE_ENV"].map((key) => [key, process.env[key]]),
);
const secret = "synthetic-service-secret";
const sessionId = "synthetic-opaque-session-id";
const email = "persona@example.com";
const endpoint = "https://backend.test:8080";
const diagnostic = JSON.stringify({ sesionId: sessionId, secret, email, usuarioId: "synthetic-user-id" });

beforeEach((t) => {
  process.env.BACKEND_URL = endpoint;
  process.env.BFF_SERVICE_SECRET = secret;
  process.env.NODE_ENV = "test";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected upstream call");
  });
});

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function login(body = JSON.stringify({ email }), headers = {}, url = "https://frontend.test/api/usuarios/sesiones") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `ca_sesion=${sessionId}`, ...headers },
    body,
  });
}

function logout(headers = {}, url = "https://frontend.test/api/usuarios/sesiones/actual", body) {
  return new NextRequest(url, { method: "DELETE", headers, body });
}

function upstream(status, body = diagnostic, headers = {}) {
  return new Response(status === 204 ? null : body, {
    status,
    headers: { "Content-Type": "application/json", "X-Service-Token": secret, ...headers },
  });
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie") === null, true);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  assert.equal(body.codigo, code);
  assert.equal(typeof body.mensaje, "string");
  assert.ok(body.mensaje.length > 0);
  const publicData = JSON.stringify([Object.fromEntries(response.headers), body]);
  for (const value of [secret, sessionId, email, "usuarioId", "synthetic-user-id", endpoint]) {
    assert.equal(publicData.includes(value), false);
  }
}

test("inicio 201 crea solo la cookie de sesión y envía el secreto únicamente al backend", async (t) => {
  const call = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), `${endpoint}/api/usuarios/sesiones`);
    assert.equal(options.method, "POST");
    assert.equal(JSON.parse(options.body).email === email, true);
    assert.deepEqual(Object.keys(options.headers).sort(), ["Accept", "Content-Type", "X-Service-Token"].sort());
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers.Accept, "application/json");
    assert.equal(options.headers["X-Service-Token"] === secret, true);
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return upstream(201, JSON.stringify({ sesionId: sessionId }));
  });
  const response = await POST(login(JSON.stringify({ email }), {
    "X-Service-Token": "forged-client-token", "X-Session-Id": "forged-session",
    Authorization: "Bearer forged", "X-Backend-Url": "https://untrusted.test",
  }, "https://frontend.test/api/usuarios/sesiones?backend=https://untrusted.test"));
  assert.equal(call.mock.callCount(), 1);
  assert.equal(response.status, 201);
  assert.equal(response.body, null);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-service-token") === null, true);
  const cookie = response.headers.get("set-cookie");
  assert.equal(cookie.startsWith(`ca_sesion=${sessionId};`), true);
  for (const attribute of [/HttpOnly/i, /SameSite=Lax/i, /Path=\//i, /Secure/i]) assert.match(cookie, attribute);
  assert.equal(/Max-Age|Expires|persona@|forged/i.test(cookie), false);
});

test("inicio local HTTP omite Secure, pero producción lo exige", async (t) => {
  t.mock.method(globalThis, "fetch", async () => upstream(201, JSON.stringify({ sesionId: sessionId })));
  assert.equal(/Secure/.test((await POST(login(undefined, {}, "http://localhost/api/usuarios/sesiones"))).headers.get("set-cookie")), false);
  process.env.NODE_ENV = "production";
  assert.equal(/Secure/.test((await POST(login(undefined, {}, "http://localhost/api/usuarios/sesiones"))).headers.get("set-cookie")), true);
});

test("inicio rechaza JSON, tipo y tamaño efectivos antes de consultar Spring Boot", async () => {
  for (const body of ["{", "[]", "{}", JSON.stringify({ email, sesionId: sessionId }), JSON.stringify({ email: "invalid" })]) {
    await expectError(await POST(login(body)), 400, "SOLICITUD_INVALIDA");
  }
  await expectError(await POST(login(undefined, { "Content-Type": "text/plain" })), 415, "TIPO_CONTENIDO_NO_ADMITIDO");
  await expectError(await POST(login(JSON.stringify({ email }).padEnd(2049, " "), { "Content-Length": "1" })), 413, "SOLICITUD_DEMASIADO_GRANDE");
  assert.equal(fetch.mock.callCount(), 0);
});

test("inicio distingue 404 funcional y valida el contenido de 201 y 404", async (t) => {
  t.mock.method(globalThis, "fetch", async () => upstream(404, '{"codigo":"CORREO_NO_REGISTRADO","mensaje":"private"}'));
  await expectError(await POST(login()), 404, "CORREO_NO_REGISTRADO");
  for (const body of [diagnostic, "{}", '{"sesionId":""}', '{"sesionId":123}', '{"sesionId":"invalid\\nvalue"}', "{"]) {
    t.mock.method(globalThis, "fetch", async () => upstream(201, body));
    await expectError(await POST(login()), 502, "SERVICIO_NO_DISPONIBLE");
  }
  t.mock.method(globalThis, "fetch", async () => upstream(201, JSON.stringify({ sesionId: sessionId }), { "Content-Type": "text/plain" }));
  await expectError(await POST(login()), 502, "SERVICIO_NO_DISPONIBLE");
  t.mock.method(globalThis, "fetch", async () => upstream(201, JSON.stringify({ sesionId: "x".repeat(4096) })));
  await expectError(await POST(login()), 502, "SERVICIO_NO_DISPONIBLE");
  t.mock.method(globalThis, "fetch", async () => upstream(404, '{"codigo":"OTRO","mensaje":"private"}'));
  await expectError(await POST(login()), 502, "SERVICIO_NO_DISPONIBLE");
});

test("inicio conserva cookie previa ante respuestas controladas e inesperadas", async (t) => {
  for (const [upstreamStatus, status, code] of [
    [400, 400, "SOLICITUD_INVALIDA"], [413, 413, "SOLICITUD_DEMASIADO_GRANDE"],
    [415, 415, "TIPO_CONTENIDO_NO_ADMITIDO"], [401, 502, "SERVICIO_NO_DISPONIBLE"],
    [403, 502, "SERVICIO_NO_DISPONIBLE"], [500, 502, "SERVICIO_NO_DISPONIBLE"],
    [200, 502, "SERVICIO_NO_DISPONIBLE"], [307, 502, "SERVICIO_NO_DISPONIBLE"],
  ]) {
    const call = t.mock.method(globalThis, "fetch", async () => upstream(upstreamStatus));
    await expectError(await POST(login()), status, code);
    assert.equal(call.mock.callCount(), 1);
  }
});

test("inicio falla cerrado por configuración y por pérdida de respuesta, sin reintentos", async (t) => {
  delete process.env.BFF_SERVICE_SECRET;
  await expectError(await POST(login()), 503, "SERVICIO_NO_DISPONIBLE");
  process.env.BFF_SERVICE_SECRET = secret;
  process.env.BACKEND_URL = "https://backend.test:8080/untrusted";
  await expectError(await POST(login()), 503, "SERVICIO_NO_DISPONIBLE");
  assert.equal(fetch.mock.callCount(), 0);
  process.env.BACKEND_URL = endpoint;
  const logs = ["log", "warn", "error"].map((name) => t.mock.method(console, name));
  const call = t.mock.method(globalThis, "fetch", async () => { throw new Error(diagnostic); });
  await expectError(await POST(login()), 502, "SERVICIO_NO_DISPONIBLE");
  assert.equal(call.mock.callCount(), 1);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("inicio y cierre agotan el mismo timeout sin repetir la operación", async (t) => {
  const controllers = [];
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 5000);
    const controller = new AbortController();
    controllers.push(controller);
    return controller.signal;
  });
  const call = t.mock.method(globalThis, "fetch", async (_url, options) => {
    const controller = controllers.at(-1);
    queueMicrotask(() => controller.abort(new DOMException("synthetic timeout", "TimeoutError")));
    return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
  });
  await expectError(await POST(login()), 504, "TIEMPO_DE_ESPERA_AGOTADO");
  await expectError(await DELETE(logout({ Cookie: `ca_sesion=${sessionId}` })), 504, "TIEMPO_DE_ESPERA_AGOTADO");
  assert.equal(call.mock.callCount(), 2);
});

test("cierre sin cookie devuelve 204 vacío sin backend aunque el cliente envíe un ID", async () => {
  const response = await DELETE(logout({ "X-Session-Id": sessionId, "X-Service-Token": "forged" }, `https://frontend.test/api/usuarios/sesiones/actual?sesionId=${sessionId}`));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("set-cookie") === null, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fetch.mock.callCount(), 0);
});

test("cierre usa solo cookie y secreto de servidor; 204 borra cookie con la misma ruta", async (t) => {
  const call = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), `${endpoint}/api/usuarios/sesiones/actual`);
    assert.equal(options.method, "DELETE");
    assert.equal(options.body === undefined, true);
    assert.deepEqual(Object.keys(options.headers).sort(), ["X-Service-Token", "X-Session-Id"].sort());
    assert.equal(options.headers["X-Service-Token"] === secret, true);
    assert.equal(options.headers["X-Session-Id"] === sessionId, true);
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return upstream(204);
  });
  const response = await DELETE(logout({ Cookie: `ca_sesion=${sessionId}`, "X-Session-Id": "forged", "X-Service-Token": "forged" }, "https://frontend.test/api/usuarios/sesiones/actual?sesionId=forged", JSON.stringify({ sesionId: "forged" })));
  assert.equal(call.mock.callCount(), 1);
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const deletion = response.headers.get("set-cookie");
  assert.equal(deletion.startsWith("ca_sesion=;"), true);
  assert.equal(deletion.includes("Path=/"), true);
  assert.equal(/Max-Age=0|Expires=/.test(deletion), true);
  assert.equal(deletion.includes("Secure"), true);
  assert.equal(response.headers.get("x-service-token") === null, true);
});

test("cierre rechaza cookie malformada sin transmitirla ni borrarla", async () => {
  await expectError(await DELETE(logout({ Cookie: "ca_sesion=%0Ainvalid" })), 400, "SOLICITUD_INVALIDA");
  assert.equal(fetch.mock.callCount(), 0);
});

test("cierre conserva cookie frente a fallos, redirección y respuesta inválida", async (t) => {
  for (const [upstreamStatus, status] of [[400, 400], [401, 502], [403, 502], [500, 502], [200, 502], [307, 502]]) {
    const call = t.mock.method(globalThis, "fetch", async () => upstream(upstreamStatus));
    await expectError(await DELETE(logout({ Cookie: `ca_sesion=${sessionId}` })), status,
      status === 400 ? "SOLICITUD_INVALIDA" : "SERVICIO_NO_DISPONIBLE");
    assert.equal(call.mock.callCount(), 1);
  }
  const invalid = t.mock.method(globalThis, "fetch", async () => upstream(204, undefined, { "Content-Length": "1" }));
  await expectError(await DELETE(logout({ Cookie: `ca_sesion=${sessionId}` })), 502, "SERVICIO_NO_DISPONIBLE");
  assert.equal(invalid.mock.callCount(), 1);
  const lost = t.mock.method(globalThis, "fetch", async () => { throw new Error(diagnostic); });
  await expectError(await DELETE(logout({ Cookie: `ca_sesion=${sessionId}` })), 502, "SERVICIO_NO_DISPONIBLE");
  assert.equal(lost.mock.callCount(), 1);
});

test("cierre sin configuración no envía una solicitud sin token", async () => {
  delete process.env.BFF_SERVICE_SECRET;
  await expectError(await DELETE(logout({ Cookie: `ca_sesion=${sessionId}` })), 503, "SERVICIO_NO_DISPONIBLE");
  assert.equal(fetch.mock.callCount(), 0);
});

// Se registran al final para no afectar otros archivos de node:test.
after(async () => {
  await unregisterTsx();
});
