import assert from "node:assert/strict";
import { test } from "node:test";
import { registrarCorreo, iniciarSesion, cerrarSesion } from "../../src/components/identificacion/solicitudes.ts";

const email = "persona@example.com";
const secret = "synthetic-service-secret";
const sessionId = "synthetic-opaque-session-id";
const privateMessage = `private ${email} ${secret} ${sessionId}`;

function assertSafe(result) {
  assert.equal(typeof result.ok, "boolean");
  assert.equal(typeof result.message, "string");
  assert.ok(result.message.length > 0);
  for (const value of [email, secret, sessionId]) assert.equal(result.message.includes(value), false);
}

test("registro usa únicamente su BFF, POST JSON y 204 como éxito", async (t) => {
  const call = t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/usuarios/identificacion");
    assert.deepEqual(Object.keys(options).sort(), ["method", "headers", "body", "credentials", "cache", "signal"].sort());
    assert.equal(options.method, "POST");
    assert.deepEqual(Object.keys(options.headers), ["Content-Type"]);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(JSON.parse(options.body).email === email, true);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal instanceof AbortSignal, true);
    return new Response(null, { status: 204 });
  });
  const result = await registrarCorreo(email);
  assert.equal(result.ok, true);
  assert.match(result.message, /ni se inició sesión/i);
  assertSafe(result);
  assert.equal(call.mock.callCount(), 1);
});

test("inicio usa únicamente su BFF, POST JSON y 201 como éxito", async (t) => {
  const call = t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/usuarios/sesiones");
    assert.deepEqual(Object.keys(options).sort(), ["method", "headers", "body", "credentials", "cache", "signal"].sort());
    assert.equal(options.method, "POST");
    assert.deepEqual(Object.keys(options.headers), ["Content-Type"]);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(JSON.parse(options.body).email === email, true);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal instanceof AbortSignal, true);
    return new Response(null, { status: 201 });
  });
  const result = await iniciarSesion(email);
  assert.equal(result.ok, true);
  assert.match(result.message, /declarativa/);
  assertSafe(result);
  assert.equal(call.mock.callCount(), 1);
});

test("cierre usa DELETE sin cuerpo ni token y exige 204", async (t) => {
  const call = t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/usuarios/sesiones/actual");
    assert.deepEqual(Object.keys(options).sort(), ["method", "credentials", "cache", "signal"].sort());
    assert.equal(options.method, "DELETE");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal instanceof AbortSignal, true);
    return new Response(null, { status: 204 });
  });
  const result = await cerrarSesion();
  assert.equal(result.ok, true);
  assertSafe(result);
  assert.equal(call.mock.callCount(), 1);
});

test("registro e inicio no aceptan el código de éxito de la otra operación", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 201 }));
  const registration = await registrarCorreo(email);
  assert.equal(registration.ok, false);
  assertSafe(registration);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  const login = await iniciarSesion(email);
  assert.equal(login.ok, false);
  assertSafe(login);
});

test("404 CORREO_NO_REGISTRADO tiene mensaje específico solo para inicio", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ codigo: "CORREO_NO_REGISTRADO", mensaje: privateMessage }, { status: 404 }));
  const result = await iniciarSesion(email);
  assert.equal(result.ok, false);
  assert.match(result.message, /no está registrado/i);
  assertSafe(result);
});

test("errores de validación, red y respuesta HTTP insegura no filtran datos", async (t) => {
  for (const [status, codigo, expected] of [
    [400, "SOLICITUD_INVALIDA", /Revisá el correo/],
    [413, "SOLICITUD_DEMASIADO_GRANDE", /tamaño permitido/],
    [415, "TIPO_CONTENIDO_NO_ADMITIDO", /No se pudo enviar/],
    [429, "DEMASIADAS_SOLICITUDES", /Demasiadas solicitudes/],
    [502, "SERVICIO_NO_DISPONIBLE", /No se pudo confirmar/],
  ]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ codigo, mensaje: privateMessage }, { status }));
    const result = await iniciarSesion(email);
    assert.equal(result.ok, false);
    assert.match(result.message, expected);
    assertSafe(result);
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error(privateMessage); });
  for (const operation of [registrarCorreo, iniciarSesion]) {
    const result = await operation(email);
    assert.equal(result.ok, false);
    assertSafe(result);
  }
  const logout = await cerrarSesion();
  assert.equal(logout.ok, false);
  assertSafe(logout);
});

test("cierre con 201, 404 o fallo de red no afirma éxito", async (t) => {
  for (const status of [201, 404, 500]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ codigo: "PRIVATE", mensaje: privateMessage }, { status }));
    const result = await cerrarSesion();
    assert.equal(result.ok, false);
    assertSafe(result);
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error(privateMessage); });
  const result = await cerrarSesion();
  assert.equal(result.ok, false);
  assertSafe(result);
});

test("429 y 503 propios del BFF preservan el fallo y muestran mensajes seguros", async (t) => {
  for (const [status, codigo] of [
    [429, "BFF_LIMITE_SOLICITUDES"],
    [503, "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE"],
  ]) {
    const call = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ codigo, mensaje: privateMessage }, { status }));
    for (const operation of [registrarCorreo, iniciarSesion, cerrarSesion]) {
      const result = await operation(email);
      assert.equal(result.ok, false);
      assertSafe(result);
      assert.match(result.message, status === 429 ? /Demasiadas solicitudes/ : /No se pudo confirmar/);
    }
    assert.equal(call.mock.callCount(), 3);
  }
});
