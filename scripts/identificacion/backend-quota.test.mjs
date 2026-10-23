import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { installRateLimitTestModules } from "./rate-limit-test-modules.mjs";

// Guard admitido y fetch reemplazado: ningún SDK Redis, servidor ni archivo .env.
const hooks = installRateLimitTestModules({ admitRequests: true });
const { NextRequest } = await import("next/server.js");
const { POST: identify } = await import("../../src/app/api/usuarios/identificacion/route.ts");
const { POST: login } = await import("../../src/app/api/usuarios/sesiones/route.ts");
const { DELETE: logout } = await import("../../src/app/api/usuarios/sesiones/actual/route.ts");
const { registrarCorreo, iniciarSesion, cerrarSesion } = await import("../../src/components/identificacion/solicitudes.ts");

const synthetic = {
  BACKEND_URL: "https://backend.test",
  BFF_SERVICE_SECRET: "synthetic-service-token",
  NODE_ENV: "test",
};
const original = Object.fromEntries(Object.keys(synthetic).map((key) => [key, process.env[key]]));
const session = "synthetic-session-id";
const email = "persona@example.test";
const privateMessage = `${synthetic.BFF_SERVICE_SECRET} ${session} ${email} 192.0.2.1 Redis SQLException`;
const operations = [
  { name: "identificación", handler: identify, browser: registrarCorreo, method: "POST", path: "/api/usuarios/identificacion" },
  { name: "inicio", handler: login, browser: iniciarSesion, method: "POST", path: "/api/usuarios/sesiones" },
  { name: "cierre", handler: logout, browser: cerrarSesion, method: "DELETE", path: "/api/usuarios/sesiones/actual" },
];
const errors = [
  [429, "CUOTA_GLOBAL_SUPERADA", "Cuota global superada. Intentá nuevamente más tarde."],
  [503, "CONTROL_CUOTA_GLOBAL_NO_DISPONIBLE", "No se pudo comprobar la cuota global. Intentá más tarde."],
];

beforeEach((t) => {
  Object.assign(process.env, synthetic);
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected network call"); });
  t.mock.method(AbortSignal, "timeout", (ms) => {
    assert.ok(ms === 5000 || ms === 10_000);
    return new AbortController().signal;
  });
  for (const method of ["setTimeout", "setInterval"]) {
    t.mock.method(globalThis, method, () => { throw new Error("Unexpected automatic timer"); });
  }
  for (const method of ["log", "warn", "error"]) t.mock.method(console, method, () => {});
});

afterEach(() => {
  for (const method of ["setTimeout", "setInterval"]) assert.equal(globalThis[method].mock.callCount(), 0);
  for (const method of ["log", "warn", "error"]) assert.equal(console[method].mock.callCount(), 0);
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
after(() => hooks.deregister());

function request(operation, cookie = true) {
  return new NextRequest(`https://frontend.test${operation.path}`, {
    method: operation.method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: `ca_sesion=${session}` } : {}),
    },
    ...(operation.method === "POST" ? { body: JSON.stringify({ email }) } : {}),
  });
}

function upstream(status, codigo, retryAfter) {
  return Response.json({ codigo, mensaje: privateMessage }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": `ca_sesion=${session}`,
      "X-Service-Token": synthetic.BFF_SERVICE_SECRET,
      "X-Session-Id": session,
      Location: "https://untrusted.test",
      ...(retryAfter === undefined ? {} : { "Retry-After": retryAfter }),
    },
  });
}

async function expectError(response, status, codigo, mensaje, retryAfter = null) {
  assert.equal(response.status, status);
  // Lista cerrada: no cookies, tokens, Location ni otras cabeceras del upstream.
  assert.deepEqual(Object.fromEntries(response.headers), {
    "cache-control": "no-store",
    "content-type": "application/json",
    ...(retryAfter === null ? {} : { "retry-after": retryAfter }),
  });
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  assert.equal(body.codigo, codigo);
  if (mensaje !== undefined) assert.equal(body.mensaje, mensaje);
  else assert.match(body.mensaje, /No se pudo confirmar/);
  for (const value of privateMessage.split(" ")) assert.equal(JSON.stringify(body).includes(value), false);
}

for (const operation of operations) {
  for (const [status, codigo, mensaje] of errors) {
    test(`${operation.name}: ${status} ${codigo} seguro y sin cambios de cookie`, async (t) => {
      const call = t.mock.method(globalThis, "fetch", async (url, options) => {
        assert.equal(String(url), synthetic.BACKEND_URL + operation.path);
        assert.equal(options.method, operation.method);
        assert.equal(options.headers["X-Service-Token"] === synthetic.BFF_SERVICE_SECRET, true);
        assert.equal(options.headers["X-Session-Id"] === session, operation.method === "DELETE");
        assert.equal(options.cache, "no-store");
        assert.equal(options.credentials, "omit");
        assert.equal(options.redirect, "error");
        return upstream(status, codigo, "9");
      });
      for (const cookie of operation.method === "POST" ? [false, true] : [true]) {
        const incoming = request(operation, cookie);
        await expectError(await operation.handler(incoming), status, codigo, mensaje, status === 429 ? "9" : null);
        assert.equal(incoming.cookies.has("ca_sesion"), cookie);
      }
      assert.equal(call.mock.callCount(), operation.method === "POST" ? 2 : 1);
      assert.equal(AbortSignal.timeout.mock.callCount(), call.mock.callCount());
    });
  }

  test(`${operation.name}: Retry-After global solo entero positivo acotado, sin reintentos`, async (t) => {
    for (const [value, expected] of [
      [undefined, null], ["1", "1"], ["0002", "2"], ["60", "60"], ["86400", "86400"],
      ["86401", null], ["9007199254740991", null], ["9007199254740992", null],
      ["", null], ["0", null], ["-1", null], ["+1", null], ["1.5", null], ["1e2", null],
      ["NaN", null], ["Infinity", null], ["1, 2", null], ["1 2", null], ["Thu, 15 Oct 2026 12:00:00 GMT", null],
    ]) {
      const call = t.mock.method(globalThis, "fetch", async () => upstream(429, errors[0][1], value));
      await expectError(await operation.handler(request(operation)), ...errors[0], expected);
      assert.equal(call.mock.callCount(), 1);
    }
  });

  test(`${operation.name}: errores de cuota no contractuales se clasifican como 502`, async (t) => {
    for (const status of [429, 503]) {
      const validCode = status === 429 ? errors[0][1] : errors[1][1];
      const bodies = [
        "{", "", "null", "[]", "false", '"texto"', "{}",
        JSON.stringify({ codigo: validCode }),
        JSON.stringify({ codigo: validCode, mensaje: 123 }),
        JSON.stringify({ codigo: validCode, mensaje: null }),
        JSON.stringify({ codigo: 123, mensaje: privateMessage }),
        JSON.stringify({ codigo: validCode, mensaje: privateMessage, extra: "private" }),
        JSON.stringify({ codigo: "DESCONOCIDO", mensaje: privateMessage }),
        JSON.stringify({ codigo: "BFF_LIMITE_SOLICITUDES", mensaje: privateMessage }),
        JSON.stringify({ codigo: "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE", mensaje: privateMessage }),
        JSON.stringify({ codigo: status === 429 ? errors[1][1] : errors[0][1], mensaje: privateMessage }),
        JSON.stringify({ codigo: validCode, mensaje: "x".repeat(4096) }),
        new Uint8Array([0xc3, 0x28]),
      ];
      if (status === 503 || operation.handler !== identify) {
        bodies.push(JSON.stringify({ codigo: "DEMASIADAS_SOLICITUDES", mensaje: privateMessage }));
      }
      for (const body of bodies) {
        const call = t.mock.method(globalThis, "fetch", async () => new Response(body, {
          status, headers: { "Content-Type": "application/json", "Retry-After": "10" },
        }));
        await expectError(await operation.handler(request(operation)), 502, "SERVICIO_NO_DISPONIBLE");
        assert.equal(call.mock.callCount(), 1);
      }
      for (const contentType of [null, "text/plain", "text/html"]) {
        const call = t.mock.method(globalThis, "fetch", async () => {
          const response = upstream(status, validCode, "10");
          if (contentType === null) response.headers.delete("Content-Type");
          else response.headers.set("Content-Type", contentType);
          return response;
        });
        await expectError(await operation.handler(request(operation)), 502, "SERVICIO_NO_DISPONIBLE");
        assert.equal(call.mock.callCount(), 1);
      }
    }
    for (const status of [401, 403, 500, 502]) {
      for (const [, codigo] of errors) {
        const call = t.mock.method(globalThis, "fetch", async () => upstream(status, codigo, "10"));
        await expectError(await operation.handler(request(operation)), 502, "SERVICIO_NO_DISPONIBLE");
        assert.equal(call.mock.callCount(), 1);
      }
    }
  });

  test(`${operation.name}: lectura interrumpida o timeout conserva 502/504 sin reintentar`, async (t) => {
    for (const status of [429, 503]) {
      for (const aborted of [false, true]) {
        const controller = new AbortController();
        t.mock.method(AbortSignal, "timeout", () => controller.signal);
        const call = t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
          pull(stream) {
            if (aborted) controller.abort();
            stream.error(new Error(privateMessage));
          },
        }, { highWaterMark: 0 }), { status, headers: { "Content-Type": "application/json" } }));
        await expectError(await operation.handler(request(operation)), aborted ? 504 : 502,
          aborted ? "TIEMPO_DE_ESPERA_AGOTADO" : "SERVICIO_NO_DISPONIBLE");
        assert.equal(call.mock.callCount(), 1);
      }
    }
  });

  test(`${operation.name}: el consumidor del navegador recibe fallo, sin confirmar transición`, async (t) => {
    for (const [status, codigo] of errors) {
      let bffCalls = 0;
      let backendCalls = 0;
      const call = t.mock.method(globalThis, "fetch", async (url) => {
        if (url === operation.path) {
          bffCalls++;
          return operation.handler(request(operation));
        }
        assert.equal(String(url), synthetic.BACKEND_URL + operation.path);
        backendCalls++;
        return upstream(status, codigo, "3");
      });
      const result = await operation.browser(email);
      assert.equal(result.ok, false); // Los callbacks React solo confirman estado cuando ok === true.
      assert.equal(typeof result.message, "string");
      for (const value of privateMessage.split(" ")) assert.equal(result.message.includes(value), false);
      assert.equal(call.mock.callCount(), 2);
      assert.equal(bffCalls, 1);
      assert.equal(backendCalls, 1);
    }
  });
}

test("cierre sin cookie tras admisión es 204 local y no consulta cuota global", async () => {
  const response = await logout(request(operations[2], false));
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.deepEqual(Object.fromEntries(response.headers), { "cache-control": "no-store" });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(AbortSignal.timeout.mock.callCount(), 0);
});
