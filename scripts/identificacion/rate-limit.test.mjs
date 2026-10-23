import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { installRateLimitTestModules } from "./rate-limit-test-modules.mjs";

const hooks = installRateLimitTestModules();
const { normalizeIp } = await import("../../src/features/rate-limiting/ip.ts");
const { trustedIp } = await import("../../src/features/rate-limiting/trusted-ip.ts");
const { consumeRateLimit, RATE_LIMIT_ENDPOINTS: endpoints } = await import("../../src/features/rate-limiting/limit.ts");
const { RATE_LIMIT_SCRIPT } = await import("../../src/features/rate-limiting/script.ts");
after(() => hooks.deregister());

const secret = "synthetic-rate-limit-secret-for-tests-only";
const ip = "192.0.2.1";

beforeEach((t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("Network forbidden"); });
});

// Modelo determinista de Redis EVAL, con reloj controlado. No ejecuta Lua:
// comprueba llamadas y política; la atomicidad real depende de EVAL en Redis.
function redisStub() {
  const entries = new Map();
  let now = 0;
  let calls = 0;
  return {
    entries,
    advance(ms) { now += ms; },
    get calls() { return calls; },
    async eval(script, keys, args) {
      calls++;
      assert.equal(script, RATE_LIMIT_SCRIPT);
      assert.equal(keys.length, 1);
      assert.match(keys[0], /^rate-limiting:frontend:(post-usuarios-identificacion|post-usuarios-sesiones|delete-usuarios-sesiones-actual):[a-f0-9]{64}$/);
      assert.deepEqual(args, [30, 60_000]);
      const [key] = keys;
      let entry = entries.get(key);
      if (!entry || entry.expires <= now) {
        entry = { count: 0, expires: now + 60_000 };
        entries.set(key, entry);
      }
      const allowed = entry.count < 30;
      if (allowed) entry.count++;
      return [Number(allowed), entry.count, entry.expires - now];
    },
  };
}

test("normaliza IPv4, IPv6 y direcciones IPv4 mapeadas a una identidad canónica", () => {
  for (const [raw, expected] of [
    [ip, ip], [" 192.0.2.1 ", ip], ["::ffff:192.0.2.1", ip],
    ["0:0:0:0:0:FFFF:C000:0201", ip],
    ["2001:0DB8:0000:0000:0000:0000:0000:0001", "2001:db8::1"],
    ["2001:db8::1", "2001:db8::1"], ["::", "::"], ["::1", "::1"],
    ["2001:db8:0:1:0:0:0:1", "2001:db8:0:1::1"],
  ]) assert.equal(normalizeIp(raw), expected);
  for (const raw of [null, "", "unknown", "192.000.2.1", "192.0.2.256", "1234", "0xc0000201", "192.0.2.1:80", "[::1]", "2001:db8:::1", "fe80::1%eth0", "192.0.2.1, 198.51.100.1", "for=192.0.2.1", "example.com", "https://192.0.2.1", "::1/128"]) {
    assert.equal(normalizeIp(raw), null);
  }
});

test("adaptador solo confía en el header de Vercel en producción/preview, sin fallback local", () => {
  const names = ["VERCEL", "VERCEL_ENV", "NODE_ENV"];
  const original = names.map((key) => process.env[key]);
  try {
    const request = new Request("https://frontend.test/", {
      headers: { "x-vercel-forwarded-for": ip, "x-forwarded-for": "198.51.100.1", "x-real-ip": "203.0.113.1" },
    });
    process.env.VERCEL = "1";
    process.env.NODE_ENV = "production";
    for (const environment of ["production", "preview"]) {
      process.env.VERCEL_ENV = environment;
      assert.equal(trustedIp(request), ip);
    }
    for (const value of [undefined, "", "unknown", "192.0.2.1, 198.51.100.1"]) {
      if (value === undefined) request.headers.delete("x-vercel-forwarded-for");
      else request.headers.set("x-vercel-forwarded-for", value);
      assert.equal(trustedIp(request), null);
    }
    request.headers.set("x-vercel-forwarded-for", ip);
    delete process.env.VERCEL;
    assert.equal(trustedIp(request), null);
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "development";
    assert.equal(trustedIp(request), null);
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "development";
    assert.equal(trustedIp(request), null);
  } finally {
    names.forEach((key, i) => {
      if (original[i] === undefined) delete process.env[key];
      else process.env[key] = original[i];
    });
  }
});

test("admite exactamente 30, rechaza la 31 y posteriores sin incrementar ni renovar TTL", async () => {
  const redis = redisStub();
  for (let i = 1; i <= 30; i++) {
    assert.deepEqual(await consumeRateLimit(redis, endpoints.identification, ip, secret), { allowed: true });
    redis.advance(1000);
  }
  assert.deepEqual(await consumeRateLimit(redis, endpoints.identification, ip, secret), { allowed: false, retryAfter: 30 });
  const entry = [...redis.entries.values()][0];
  assert.deepEqual(entry, { count: 30, expires: 60_000 });
  redis.advance(29_500);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(await consumeRateLimit(redis, endpoints.identification, ip, secret), { allowed: false, retryAfter: 1 });
  }
  assert.deepEqual(entry, { count: 30, expires: 60_000 });
  redis.advance(500);
  assert.deepEqual(await consumeRateLimit(redis, endpoints.identification, ip, secret), { allowed: true });
  assert.deepEqual([...redis.entries.values()][0], { count: 1, expires: 120_000 });
  assert.equal(redis.calls, 42);
});

test("distintos endpoints/IP tienen cupos independientes y representaciones equivalentes los comparten", async () => {
  const redis = redisStub();
  for (let i = 0; i < 30; i++) {
    await consumeRateLimit(redis, endpoints.identification, i % 2 ? ip : "::ffff:c000:201", secret);
  }
  assert.equal((await consumeRateLimit(redis, endpoints.identification, "::ffff:192.0.2.1", secret)).allowed, false);
  for (const endpoint of [endpoints.sessionStart, endpoints.sessionEnd]) {
    assert.equal((await consumeRateLimit(redis, endpoint, ip, secret)).allowed, true);
  }
  assert.equal((await consumeRateLimit(redis, endpoints.identification, "198.51.100.1", secret)).allowed, true);
  assert.equal(redis.entries.size, 4);
});

test("solicitudes concurrentes desde clientes distintos comparten un solo EVAL por petición: máximo 30", async () => {
  const server = redisStub();
  const clients = Array.from({ length: 4 }, () => ({ eval: (...args) => server.eval(...args) }));
  const results = await Promise.all(Array.from({ length: 200 }, (_, i) =>
    consumeRateLimit(clients[i % 4], endpoints.sessionStart, ip, secret)));
  assert.equal(results.filter((result) => result.allowed).length, 30);
  assert.equal(results.filter((result) => !result.allowed).length, 170);
  assert.equal(server.calls, 200);
  assert.deepEqual([...server.entries.values()], [{ count: 30, expires: 60_000 }]);
});

test("clave usa HMAC con separación de dominio y nunca la IP; secreto/endpoint inválidos no llaman Redis", async () => {
  const redis = redisStub();
  await consumeRateLimit(redis, endpoints.identification, ip, secret);
  const expected = createHmac("sha256", secret).update(`conciencia-alimentaria:rate-limiting:ip:v1\n${ip}`).digest("hex");
  assert.deepEqual([...redis.entries.keys()], [`rate-limiting:frontend:${endpoints.identification}:${expected}`]);
  for (const value of [undefined, "", " ".repeat(32), "short"]) {
    await assert.rejects(consumeRateLimit(redis, endpoints.identification, ip, value));
  }
  await assert.rejects(consumeRateLimit(redis, "client-controlled", ip, secret));
  await assert.rejects(consumeRateLimit(redis, endpoints.identification, "invalid", secret));
  assert.equal(redis.calls, 1);
  await consumeRateLimit(redis, endpoints.identification, ip, secret + "different");
  assert.equal(redis.entries.size, 2);
});

test("respuestas Redis inválidas no se confunden con admisión o cuota agotada", async () => {
  for (const result of [null, undefined, [], [1], [1, 1], [1, 1, 60_000, 0], ["1", 1, 60_000], [1, 0, 60_000], [1, 31, 60_000], [0, 29, 60_000], [2, 30, 60_000], [1, 1, -1], [1, 1, 60_001], [1, 1, Infinity], [1, 1, 0.5]]) {
    let calls = 0;
    await assert.rejects(consumeRateLimit({ eval: async () => { calls++; return result; } }, endpoints.identification, ip, secret));
    assert.equal(calls, 1);
  }
});
