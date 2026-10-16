import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

// Requiere npm run build y Chrome instalado. Solo usa servicios locales propios.
const fixtureEmail = "Persona@Example.test";
const received = [];
let mode = 204;
let deferredResponse;
const upstream = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received.push({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
  });
  if (mode === "timeout") return;
  if (mode === "disconnect") {
    request.socket.destroy();
    return;
  }
  if (mode === "defer") {
    deferredResponse = response;
    return;
  }
  response.writeHead(mode, {
    "Retry-After": "60",
    "Set-Cookie": "identity=synthetic-secret",
    "X-User-Id": "synthetic-secret",
  });
  response.end(mode === 204 ? undefined : '{"usuarioId":"synthetic-secret"}');
});

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function waitUntil(check, message) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(message);
}

let app;
let browser;
try {
  const upstreamPort = await listen(upstream);
  const reservation = createServer();
  const appPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${appPort}`;
  const backendOrigin = `http://127.0.0.1:${upstreamPort}`;

  app = spawn(process.execPath, [
    path.resolve("node_modules/next/dist/bin/next"),
    "start", "--hostname", "127.0.0.1", "--port", String(appPort),
  ], {
    env: { ...process.env, BACKEND_URL: backendOrigin, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "ignore",
  });
  await waitUntil(async () => {
    assert.equal(app.exitCode, null, "Next.js terminó antes de estar disponible; ejecutar npm run build primero");
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }, "Next.js no inició dentro del tiempo de espera");

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  let directBackendCalls = 0;
  let submissions = 0;
  const endpoint = `${origin}/api/usuarios/identificacion`;
  context.on("request", (request) => {
    if (request.url() === endpoint && request.method() === "POST") submissions += 1;
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === backendOrigin) directBackendCalls += 1;
    if (url.origin !== origin) return route.abort();
    // Aislar el tracking existente: esta verificación no escribe en Redis ni otros servicios.
    if (url.pathname.startsWith("/api/visits")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });

  const page = await context.newPage();
  await page.goto(`${origin}/#identificacion`);
  const form = page.getByRole("form", { name: "Identificación por correo" });
  const input = form.getByLabel("Correo electrónico");
  const submit = form.getByRole("button", { name: "Enviar identificación" });
  await form.waitFor({ state: "visible" });
  assert.match(await form.innerText(), /toda la dirección se convierte a minúsculas/);
  assert.match(await form.innerText(), /No se verifica su titularidad/);

  const screenshots = await mkdtemp(path.join(tmpdir(), "conciencia-identificacion-"));
  const layout = [];
  for (const width of [320, 375, 390, 639, 640, 641, 767, 768, 769, 1023, 1024, 1025, 1280, 1536]) {
    await page.setViewportSize({ width, height: 1000 });
    await form.scrollIntoViewIfNeeded();
    const size = await form.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const field = element.querySelector("input").getBoundingClientRect();
      return {
        viewport: innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        formWidth: element.scrollWidth,
        formClientWidth: element.clientWidth,
        contained: box.left >= 0 && box.right <= innerWidth && field.left >= box.left && field.right <= box.right,
      };
    });
    assert.ok(size.contained, `Formulario fuera del viewport a ${width}px`);
    assert.ok(size.formWidth <= size.formClientWidth, `Overflow dentro del formulario a ${width}px`);
    layout.push({ width, pageOverflow: size.pageWidth > size.viewport });
    if (width === 320 || width === 1536) {
      await form.screenshot({ path: path.join(screenshots, `form-${width}.png`) });
    }
  }
  console.log(JSON.stringify({ responsive: layout, screenshots }));

  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "El proyecto", exact: true }).click();
  await page.waitForURL(`${origin}/#proyecto`);
  assert.equal(new URL(page.url()).hash, "#proyecto");
  await input.focus();
  await page.keyboard.press("Tab");
  assert.equal(await submit.evaluate((element) => element === document.activeElement), true);
  assert.notEqual(await submit.evaluate((element) => getComputedStyle(element).outlineStyle), "none");

  await submit.click();
  assert.equal(await input.evaluate((element) => element.validity.valueMissing), true);
  await input.fill("sin-arroba");
  await submit.click();
  assert.equal(await input.evaluate((element) => element.validity.typeMismatch), true);
  assert.equal(received.length, 0);

  mode = "defer";
  await input.fill(fixtureEmail);
  const successResponse = page.waitForResponse((response) => response.url() === `${origin}/api/usuarios/identificacion`);
  await submit.click();
  await form.getByRole("button", { name: "Enviando…" }).waitFor();
  assert.equal(await form.getByRole("button").isDisabled(), true);
  assert.equal(await form.getAttribute("aria-busy"), "true");
  assert.equal(await input.evaluate((element) => element.readOnly), true);
  await input.press("Enter");
  await waitUntil(() => !!deferredResponse, "El BFF no alcanzó el upstream simulado");
  assert.equal(received.length, 1);
  deferredResponse.writeHead(204, { "Set-Cookie": "identity=synthetic-secret", "X-User-Id": "synthetic-secret" });
  deferredResponse.end();
  const success = await successResponse;
  assert.equal(success.status(), 204);
  assert.equal(success.headers()["cache-control"], "no-store");
  assert.equal(success.headers()["set-cookie"], undefined);
  assert.equal(success.headers()["x-user-id"], undefined);
  await form.getByRole("status").filter({ hasText: "Identificación recibida" }).waitFor();
  assert.match(await form.getByRole("status").innerText(), /No se verificó la titularidad del correo ni se inició una sesión/);
  assert.equal(await input.inputValue(), "");
  assert.equal(submissions, 1);

  // Verificar el cuerpo por HTTP sin depender del buffer de respuestas de CDP.
  mode = 204;
  const noContent = await fetch(`${origin}/api/usuarios/identificacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: fixtureEmail }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(noContent.status, 204);
  assert.equal(noContent.body, null);
  assert.equal(await noContent.text(), "");

  for (const [upstreamMode, expectedStatus, message] of [
    [400, 400, "formato válido"],
    [413, 413, "tamaño permitido"],
    [415, 415, "formato requerido"],
    [429, 429, "límite de solicitudes"],
    [500, 502, "identificación no está disponible"],
    [200, 502, "identificación no está disponible"],
    ["disconnect", 502, "identificación no está disponible"],
    ["timeout", 504, "No se pudo confirmar la operación a tiempo"],
  ]) {
    mode = upstreamMode;
    const before = { browser: submissions, upstream: received.length };
    await input.fill(fixtureEmail);
    const pending = page.waitForResponse((response) => response.url() === `${origin}/api/usuarios/identificacion`);
    await submit.click();
    const response = await pending;
    assert.equal(response.status(), expectedStatus);
    assert.equal(response.headers()["cache-control"], "no-store");
    if (expectedStatus === 429) assert.equal(response.headers()["retry-after"], "60");
    await form.getByRole("alert").filter({ hasText: message }).waitFor();
    assert.doesNotMatch(await form.innerText(), /usuarioId|synthetic-secret/);
    assert.equal(await submit.isEnabled(), true);
    assert.equal(await input.inputValue(), fixtureEmail);
    assert.equal(await form.getAttribute("aria-busy"), "false");
    assert.equal(await form.getByRole("status").innerText(), "");
    assert.equal(submissions, before.browser + 1, "No debe reintentarse automáticamente desde el navegador");
    assert.equal(received.length, before.upstream + 1, "No debe reintentarse automáticamente desde el BFF");
  }

  // Aislar fallos entre el navegador y el BFF, sin sustituir su timeout nativo.
  for (const [fault, expectedMessage] of [
    ["timeout", /No se pudo confirmar la operación a tiempo/],
    ["connection", /Revisá tu conexión/],
    ["configuration", /identificación no está disponible/],
  ]) {
    let intercepted;
    const intercept = (route) => {
      intercepted = route;
      if (fault === "connection") return route.abort("connectionreset");
      if (fault === "configuration") {
        return route.fulfill({ status: 503, contentType: "application/json", body: '{"mensaje":"synthetic-secret"}' });
      }
      // El navegador aborta por sí mismo a los 10 segundos.
    };
    await page.route(endpoint, intercept);
    const before = { browser: submissions, upstream: received.length };
    try {
      await input.fill(fixtureEmail);
      await submit.click();
      await waitUntil(() => !!intercepted, "El navegador no inició la solicitud");
      await waitUntil(() => submit.isEnabled(), "El formulario no terminó la espera");
      assert.match(await form.getByRole("alert").innerText(), expectedMessage);
      assert.equal(await input.inputValue(), fixtureEmail);
      assert.equal(await form.getAttribute("aria-busy"), "false");
      assert.equal(await form.getByRole("status").innerText(), "");
      assert.doesNotMatch(await form.innerText(), /usuarioId|synthetic-secret/);
      assert.equal(submissions, before.browser + 1);
      assert.equal(received.length, before.upstream);
    } finally {
      if (fault === "timeout") await intercepted?.abort().catch(() => {});
      await page.unroute(endpoint, intercept);
    }
  }

  for (const request of received) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/usuarios/identificacion");
    assert.deepEqual(request.body, { email: fixtureEmail });
    for (const header of ["cookie", "authorization", "x-forwarded-for"]) {
      assert.equal(request.headers[header], undefined);
    }
  }
  assert.equal(directBackendCalls, 0);
  assert.deepEqual(await context.cookies(), []);
  const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  assert.equal(stored.includes(fixtureEmail), false);
  await page.reload();
  assert.equal(await input.inputValue(), "");
  console.log("OK: navegador → Next.js → upstream simulado; 204, carga, validación, 400/413/415/429/502/503, pérdida de conexión, ambos timeouts nativos, preservación del texto, sin reintentos, teclado y privacidad.");
  const overflowWidths = layout.filter((item) => item.pageOverflow).map((item) => item.width);
  if (overflowWidths.length) console.log(JSON.stringify({ pageOverflowWidths: overflowWidths }));
} finally {
  await browser?.close();
  if (app && app.exitCode === null) {
    const stopped = once(app, "exit");
    app.kill("SIGTERM");
    await stopped;
  }
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
}
