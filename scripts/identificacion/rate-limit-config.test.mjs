import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("falta de cada variable Redis produce 503 al importar la conexión existente, sin red", () => {
  // Procesos nuevos para no reutilizar la caché de un módulo cuya carga falló.
  for (const missing of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
    const env = {
      PATH: process.env.PATH,
      NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://redis.test",
      UPSTASH_REDIS_REST_TOKEN: "synthetic-redis-token",
      RATE_LIMIT_IP_HASH_SECRET: "synthetic-rate-limit-secret-for-tests-only",
    };
    delete env[missing];
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { installRateLimitTestModules } from "./scripts/identificacion/rate-limit-test-modules.mjs";
      const hooks = installRateLimitTestModules();
      let calls = 0;
      globalThis.fetch = () => { calls++; throw new Error("Network forbidden"); };
      const { checkRateLimit } = await import("./src/features/rate-limiting/guard.ts");
      const response = await checkRateLimit(new Request("https://frontend.test/", {
        headers: { "x-vercel-forwarded-for": "192.0.2.1" }
      }), "post-usuarios-identificacion");
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).codigo, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE");
      assert.equal(calls, 0);
      hooks.deregister();
    `], { cwd: new URL("../../", import.meta.url), env, encoding: "utf8", timeout: 10_000 });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  }
});
