import assert from "node:assert/strict";
import { after, beforeEach, afterEach, test } from "node:test";
import { installRateLimitTestModules } from "./rate-limit-test-modules.mjs";

// Entorno sintético antes de importar el cliente. No leer .env ni reutilizar
// credenciales del proceso. Todo fetch se intercepta; nunca usar nativeFetch.
const synthetic = {
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "synthetic-redis-token",
  RATE_LIMIT_IP_HASH_SECRET: "synthetic-rate-limit-secret-for-tests-only",
  BACKEND_URL: "https://backend.test",
  BFF_SERVICE_SECRET: "synthetic-service-token",
  VERCEL: "1",
  VERCEL_ENV: "production",
  NODE_ENV: "production",
};
const original = Object.fromEntries(Object.keys(synthetic).map((key) => [key, process.env[key]]));
Object.assign(process.env, synthetic);
const hooks = installRateLimitTestModules();
const { NextRequest } = await import("next/server.js");
const { POST: identify } = await import("../../src/app/api/usuarios/identificacion/route.ts");
const { POST: login } = await import("../../src/app/api/usuarios/sesiones/route.ts");
const { DELETE: logout } = await import("../../src/app/api/usuarios/sesiones/actual/route.ts");
const { getRateLimitRedis, redis: visitsRedis } = await import("../../src/features/visit-tracking/redis/redis.ts");
const { RATE_LIMIT_SCRIPT } = await import("../../src/features/rate-limiting/script.ts");

const operations = [
  [identify, "POST", "/api/usuarios/identificacion", "post-usuarios-identificacion", 204],
  [login, "POST", "/api/usuarios/sesiones", "post-usuarios-sesiones", 201],
  [logout, "DELETE", "/api/usuarios/sesiones/actual", "delete-usuarios-sesiones-actual", 204],
];
const ip = "192.0.2.1";
const session = "synthetic-session-id";
function request(operation, headers = {}) {
  return new NextRequest(`https://frontend.test${operation[2]}`, {
    method: operation[1],
    headers: { "Content-Type": "application/json", "x-vercel-forwarded-for": ip, Cookie: `ca_sesion=${session}`, ...headers },
    ...(operation[1] === "POST" ? { body: JSON.stringify({ email: "persona@example.com" }) } : {}),
  });
}

beforeEach((t) => {
  Object.assign(process.env, synthetic);
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network call"); });
});
afterEach(() => Object.assign(process.env, synthetic));
after(() => {
  hooks.deregister();
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function redisFetch(t, result = [0, 30, 12_345]) {
  return t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), synthetic.UPSTASH_REDIS_REST_URL);
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.authorization, `Bearer ${synthetic.UPSTASH_REDIS_REST_TOKEN}`);
    const command = JSON.parse(options.body);
    assert.equal(command[0], "eval");
    assert.equal(command[1], RATE_LIMIT_SCRIPT);
    assert.equal(command[2], 1);
    assert.match(command[3], /^rate-limiting:frontend:/);
    assert.deepEqual(command.slice(4), [30, 60_000]);
    return Response.json({ result });
  });
}

async function safeError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  assert.equal(body.codigo, code);
  assert.ok(body.mensaje.length > 0);
  const serialized = JSON.stringify([body, [...response.headers]]);
  for (const value of [ip, session, synthetic.RATE_LIMIT_IP_HASH_SECRET, synthetic.UPSTASH_REDIS_REST_TOKEN, synthetic.BFF_SERVICE_SECRET, "redis.test", "backend.test", "rate-limiting:"]) {
    assert.equal(serialized.includes(value), false);
  }
}

test("SDK real usa misma configuración y una instancia reutilizada, separada de las opciones de visitas", () => {
  assert.equal(getRateLimitRedis(), getRateLimitRedis());
  assert.notEqual(getRateLimitRedis(), visitsRedis);
  assert.equal(getRateLimitRedis().enableAutoPipelining, false);
  assert.equal(visitsRedis.enableAutoPipelining, true);
});

test("los tres handlers devuelven 429 BFF con TTL real, sin backend ni cambios de cookie", async (t) => {
  const call = redisFetch(t);
  for (const operation of operations) {
    const response = await operation[0](request(operation, { "X-Endpoint": "forged", "X-Forwarded-For": "203.0.113.9" }));
    assert.equal(response.headers.get("retry-after"), "13");
    await safeError(response, 429, "BFF_LIMITE_SOLICITUDES");
    const key = JSON.parse(call.mock.calls.at(-1).arguments[1].body)[3];
    assert.match(key, new RegExp(`^rate-limiting:frontend:${operation[3]}:[0-9a-f]{64}$`));
  }
  assert.equal(call.mock.callCount(), 3);
});

test("ausencia de IP confiable o secreto impide toda llamada, incluso en cierre sin cookie", async () => {
  for (const operation of operations) {
    for (const cause of ["ip", "secret", "short-secret", "hosting"]) {
      Object.assign(process.env, synthetic);
      const incoming = request(operation, { Cookie: "", "X-Forwarded-For": ip });
      if (cause === "ip") incoming.headers.delete("x-vercel-forwarded-for");
      if (cause === "secret") delete process.env.RATE_LIMIT_IP_HASH_SECRET;
      if (cause === "short-secret") process.env.RATE_LIMIT_IP_HASH_SECRET = "short";
      if (cause === "hosting") delete process.env.VERCEL;
      await safeError(await operation[0](incoming), 503, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE");
    }
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("pérdida de respuesta del SDK produce 503 sin reintentos, sin logs ni backend", async (t) => {
  const logs = ["log", "warn", "error"].map((name) => t.mock.method(console, name));
  const call = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), synthetic.UPSTASH_REDIS_REST_URL);
    throw new Error("synthetic-redis-token: uncertain write");
  });
  for (const operation of operations) {
    const response = await operation[0](request(operation));
    assert.equal(response.headers.get("retry-after"), null);
    await safeError(response, 503, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE");
  }
  assert.equal(call.mock.callCount(), 3);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("timeout real del transporte se aborta, devuelve 503 y no se reintenta", async (t) => {
  const controllers = [];
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.equal(ms, 1500);
    const controller = new AbortController();
    controllers.push(controller);
    return controller.signal;
  });
  const call = t.mock.method(globalThis, "fetch", (url, options) => {
    assert.equal(String(url), synthetic.UPSTASH_REDIS_REST_URL);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      queueMicrotask(() => controllers.at(-1).abort(new DOMException("synthetic-timeout", "TimeoutError")));
    });
  });
  for (const operation of operations) {
    await safeError(await operation[0](request(operation)), 503, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE");
  }
  assert.equal(call.mock.callCount(), 3);
  assert.ok(controllers.every((controller) => controller.signal.aborted));
});

test("fallos HTTP de Redis, JSON inválido y contador incierto devuelven 503", async (t) => {
  for (const mode of ["http", "json", "result", "redis-error"]) {
    const call = t.mock.method(globalThis, "fetch", async (url) => {
      assert.equal(String(url), synthetic.UPSTASH_REDIS_REST_URL);
      if (mode === "http") return Response.json({ error: "synthetic-private" }, { status: 503 });
      if (mode === "json") return new Response("{", { status: 200 });
      if (mode === "redis-error") return Response.json({ error: "Invalid rate limit state" });
      return Response.json({ result: [1, 31, 60_000] });
    });
    for (const operation of operations) {
      await safeError(await operation[0](request(operation)), 503, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE");
    }
    assert.equal(call.mock.callCount(), 3);
  }
});

test("admisión conserva 204/201 vacíos, cookie HttpOnly, cierre y 429 histórico del backend", async (t) => {
  const events = [];
  let backendStatus;
  const call = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === synthetic.UPSTASH_REDIS_REST_URL) {
      events.push("redis");
      return Response.json({ result: [1, 1, 60_000] });
    }
    assert.ok(String(url).startsWith(synthetic.BACKEND_URL + "/api/usuarios/"));
    events.push("backend");
    assert.equal(options.headers["X-Service-Token"], synthetic.BFF_SERVICE_SECRET);
    if (backendStatus === 429) return Response.json({ codigo: "DEMASIADAS_SOLICITUDES", mensaje: "synthetic-private" }, { status: 429, headers: { "Retry-After": "7" } });
    if (String(url).endsWith("/sesiones")) return Response.json({ sesionId: session }, { status: 201 });
    return new Response(null, { status: 204 });
  });
  for (const operation of operations) {
    const response = await operation[0](request(operation));
    assert.equal(response.status, operation[4]);
    assert.equal(response.body, null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (operation[0] === identify) assert.equal(response.headers.get("set-cookie"), null);
    if (operation[0] === login) {
      const cookie = response.headers.get("set-cookie");
      for (const pattern of [/HttpOnly/i, /SameSite=Lax/i, /Secure/i, /Path=\//]) assert.match(cookie, pattern);
      assert.doesNotMatch(cookie, /Max-Age|Expires/);
    }
    if (operation[0] === logout) assert.match(response.headers.get("set-cookie"), /Expires=|Max-Age=0/);
  }
  assert.deepEqual(events, ["redis", "backend", "redis", "backend", "redis", "backend"]);
  backendStatus = 429;
  const response = await identify(request(operations[0]));
  assert.equal(response.headers.get("retry-after"), "7");
  await safeError(response, 429, "DEMASIADAS_SOLICITUDES");
  assert.equal(call.mock.callCount(), 8);
});

test("tras admisión conserva validación 400/413/415 y cierre 204 sin cookie", async (t) => {
  const call = redisFetch(t, [1, 1, 60_000]);
  for (const operation of operations.slice(0, 2)) {
    for (const [headers, status] of [[{ "Content-Type": "text/plain" }, 415], [{ "Content-Length": "2049" }, 413], [{ "Content-Length": "invalid" }, 400]]) {
      assert.equal((await operation[0](request(operation, headers))).status, status);
    }
  }
  const response = await logout(request(operations[2], { Cookie: "" }));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(call.mock.callCount(), 7);
});

test("tras admisión los errores globales conservan su origen, con una sola llamada por dependencia", async (t) => {
  for (const [status, codigo] of [
    [429, "CUOTA_GLOBAL_SUPERADA"],
    [503, "CONTROL_CUOTA_GLOBAL_NO_DISPONIBLE"],
  ]) {
    const events = [];
    const call = t.mock.method(globalThis, "fetch", async (url) => {
      if (String(url) === synthetic.UPSTASH_REDIS_REST_URL) {
        events.push("redis");
        return Response.json({ result: [1, 1, 60_000] });
      }
      assert.ok(String(url).startsWith(synthetic.BACKEND_URL + "/api/usuarios/"));
      events.push("backend");
      return Response.json({ codigo, mensaje: "synthetic-private" }, { status });
    });
    for (const operation of operations) {
      await safeError(await operation[0](request(operation)), status, codigo);
    }
    assert.deepEqual(events, ["redis", "backend", "redis", "backend", "redis", "backend"]);
    assert.equal(call.mock.callCount(), 6);
  }
});
