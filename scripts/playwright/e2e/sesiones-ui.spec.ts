import { randomUUID } from "node:crypto";
import path from "node:path";
import { test as realTest, expect as realExpect, type Page } from "playwright/test";
import { test, expect, fixtureEmail } from "./fixtures";
import { attemptSessionCleanup } from "./session-cleanup";

const syntheticSessionId = "synthetic-opaque-session-id";

const registrationPath = "/api/usuarios/identificacion";
const loginPath = "/api/usuarios/sesiones";
const logoutPath = "/api/usuarios/sesiones/actual";

async function observeSessionResponseSizes(page: Page) {
  await page.addInitScript((paths) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const method = (args[1]?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = input instanceof Request ? input.url : String(input);
      const pathname = new URL(url, location.href).pathname;
      if (method === "POST" && pathname === paths.login && response.status === 201) {
        (window as Window & { __caLoginResponseBytes?: number }).__caLoginResponseBytes =
          (await response.clone().arrayBuffer()).byteLength;
      } else if (method === "DELETE" && pathname === paths.logout && response.status === 204) {
        (window as Window & { __caLogoutResponseBytes?: number }).__caLogoutResponseBytes =
          (await response.clone().arrayBuffer()).byteLength;
      }
      return response;
    };
  }, { login: loginPath, logout: logoutPath });
}

async function loginResponseSize(page: Page) {
  return page.evaluate(() => (window as Window & { __caLoginResponseBytes?: number }).__caLoginResponseBytes);
}

async function logoutResponseSize(page: Page) {
  return page.evaluate(() => (window as Window & { __caLogoutResponseBytes?: number }).__caLogoutResponseBytes);
}

async function openModal(page: Page) {
  await page.getByRole("button", { name: "Abrir identificación por correo" }).click({ timeout: 15_000 });
  return page.getByRole("dialog", { name: "Identificación por correo electrónico" });
}

test("el estado inicial del layout depende de la presencia de ca_sesion", async ({ page, baseURL }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  await page.context().addCookies([{
    name: "ca_sesion", value: syntheticSessionId, url: baseURL,
    httpOnly: true, sameSite: "Lax",
  }]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  expect(await page.evaluate(() => document.cookie.includes("ca_sesion"))).toBe(false);
});

test("la medición del cuerpo del 201 detecta contenido inesperado sin leerlo", async ({ page, baseURL }) => {
  await observeSessionResponseSizes(page);
  await page.route(baseURL + loginPath, (route) => route.fulfill({ status: 201, body: "x" }));
  await page.goto("/");
  await page.evaluate((path) => fetch(path, { method: "POST" }), loginPath);
  await expect.poll(() => loginResponseSize(page)).toBe(1);
});

test("registro, inicio y cierre alteran el estado solo con sus códigos de éxito", async ({ page, baseURL }) => {
  await observeSessionResponseSizes(page);
  const calls = { registration: 0, login: 0, logout: 0 };
  let registrationStatus = 400;
  let loginStatus = 404;
  let logoutStatus = 502;
  await page.route(baseURL + registrationPath, async (route) => {
    calls.registration += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON().email === fixtureEmail).toBe(true);
    expect(route.request().headers()["x-service-token"] === undefined).toBe(true);
    await route.fulfill(registrationStatus === 204
      ? { status: 204, body: "" }
      : { status: 400, contentType: "application/json", body: '{"codigo":"SOLICITUD_INVALIDA","mensaje":"synthetic-private"}' });
  });
  await page.route(baseURL + loginPath, async (route) => {
    calls.login += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON().email === fixtureEmail).toBe(true);
    expect(route.request().headers()["x-service-token"] === undefined).toBe(true);
    expect(route.request().headers()["x-session-id"] === undefined).toBe(true);
    await route.fulfill(loginStatus === 404
      ? { status: 404, contentType: "application/json", body: '{"codigo":"CORREO_NO_REGISTRADO","mensaje":"synthetic-private"}' }
      : { status: loginStatus, body: "" });
  });
  await page.route(baseURL + logoutPath, async (route) => {
    calls.logout += 1;
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postData() === null).toBe(true);
    expect(route.request().headers()["x-service-token"] === undefined).toBe(true);
    expect(route.request().headers()["x-session-id"] === undefined).toBe(true);
    await route.fulfill({ status: logoutStatus, body: "" });
  });

  await page.goto("/");
  const dialog = await openModal(page);
  await dialog.getByLabel("Correo electrónico").fill(fixtureEmail);
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/Revisá el correo/);
  expect(await dialog.getByLabel("Correo electrónico").inputValue() === fixtureEmail).toBe(true);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  registrationStatus = 204;
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("status").last()).toContainText(/registro declarativo/);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  expect(calls.registration).toBe(2);

  await dialog.getByRole("button", { name: /Iniciar sesión/ }).click();
  await dialog.getByLabel("Correo electrónico").fill(fixtureEmail);
  await dialog.getByLabel("Correo electrónico").press("Enter");
  await expect(dialog.getByRole("alert")).toContainText(/no está registrado/);
  expect(await dialog.getByLabel("Correo electrónico").inputValue() === fixtureEmail).toBe(true);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);

  loginStatus = 200;
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/No se pudo confirmar/);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  loginStatus = 201;
  const successfulLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname === loginPath && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  expect((await successfulLogin).status()).toBe(201);
  await expect.poll(() => loginResponseSize(page)).toBe(0);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  expect(calls.login).toBe(3);

  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.logout).toBe(0);
  await openModal(page);
  await page.getByRole("button", { name: "Cerrar mensaje" }).click();
  expect(calls.logout).toBe(0);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /No se pudo confirmar el cierre/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  logoutStatus = 204;
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  await expect.poll(() => logoutResponseSize(page)).toBe(0);
  await expect(page.getByRole("status").last()).toContainText(/Se cerró la sesión declarativa/);
  expect(calls.logout).toBe(2);
});

test("el formulario compartido bloquea envíos simultáneos y conserva correo tras fallo", async ({ page, baseURL }) => {
  let submissions = 0;
  let release: (() => void) | undefined;
  await page.route(baseURL + loginPath, async (route) => {
    submissions += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 502, contentType: "application/json", body: '{"codigo":"SERVICIO_NO_DISPONIBLE","mensaje":"synthetic-private"}' });
  });
  await page.goto("/");
  const dialog = await openModal(page);
  await dialog.getByRole("button", { name: /Iniciar sesión/ }).click();
  const input = dialog.getByLabel("Correo electrónico");
  const submit = dialog.locator('button[type="submit"]');
  await input.fill(fixtureEmail);
  await input.press("Enter");
  await expect(submit).toBeDisabled();
  await expect(dialog.getByRole("status").last()).toContainText(/Enviando solicitud/);
  await expect.poll(() => submissions).toBe(1);
  await page.keyboard.press("Enter");
  expect(submissions).toBe(1);
  release?.();
  await expect(dialog.getByRole("alert")).toContainText(/No se pudo confirmar/);
  await expect(submit).toBeEnabled();
  expect(await input.inputValue() === fixtureEmail).toBe(true);
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
});

// Este caso solo se ejecuta desde test-integracion.mjs, después del preflight real.
realTest("@real UI → BFF → JAR → PostgreSQL: registro, sesión, cierre y F5", async ({ page, context }) => {
  const origin = process.env.E2E_REAL_BASE_URL;
  const backendPid = Number(process.env.E2E_REAL_BACKEND_PID);
  const backendPort = Number(process.env.E2E_REAL_BACKEND_PORT);
  const orchestratorPid = Number(process.env.E2E_REAL_ORCHESTRATOR_PID);
  realTest.skip(!origin || !Number.isSafeInteger(backendPid) ||
    !Number.isSafeInteger(backendPort) || !Number.isSafeInteger(orchestratorPid),
    "Requiere el orquestador de integración y su preflight.");
  const base = new URL(origin!);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port) {
    throw new Error("Origen E2E real no local o incompleto.");
  }
  const safety = await import("../../identificacion/test-integracion.mjs");
  const config = await safety.configuration(path.resolve(__dirname, "../../.."));
  if (config.backendPort !== backendPort ||
      base.origin !== `http://127.0.0.1:${config.frontendPort}`) {
    throw new Error("Playwright real no coincide con los puertos autorizados.");
  }
  await safety.assertRealE2EProcessTree(backendPid, orchestratorPid, process.pid);
  await safety.assertOwnedPort(config.backendPort, { pid: backendPid });
  async function beforeMutation() {
    safety.readOnlyPreflight(config);
    await safety.assertEffectiveDatasource(config, { pid: backendPid, exitCode: null, signalCode: null });
  }
  const allowed = new Set([registrationPath, loginPath, logoutPath]);
  const email = `e2e-${randomUUID()}@example.com`;
  let browserSentInternalHeader = false;
  let loginDispatched = false;
  page.on("request", (request) => {
    if (!allowed.has(new URL(request.url()).pathname)) return;
    if (new URL(request.url()).pathname === loginPath && request.method() === "POST") {
      loginDispatched = true;
    }
    const headers = request.headers();
    if (headers["x-service-token"] !== undefined || headers["x-session-id"] !== undefined) {
      browserSentInternalHeader = true;
    }
  });
  let sessionClosed = false;
  try {
    await observeSessionResponseSizes(page);
    await page.goto(base.origin);
    const dialog = await openModal(page);
    await dialog.getByRole("button", { name: /Iniciar sesión/ }).click();
    await dialog.getByLabel("Correo electrónico").fill(email);
    await beforeMutation();
    await dialog.getByRole("button", { name: "Enviar" }).click();
    await realExpect(dialog.getByRole("alert")).toContainText(/no está registrado/);
    realExpect((await context.cookies()).some((cookie) => cookie.name === "ca_sesion")).toBe(false);

    await dialog.getByRole("button", { name: "Registrar correo" }).click();
    await dialog.getByLabel("Correo electrónico").fill(email);
    await beforeMutation();
    await dialog.getByRole("button", { name: "Enviar" }).click();
    await realExpect(dialog.getByRole("status").last()).toContainText(/registro declarativo/);
    await dialog.getByRole("button", { name: /Iniciar sesión/ }).click();
    await dialog.getByLabel("Correo electrónico").fill(email);
    await beforeMutation();
    const loginResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === loginPath && response.request().method() === "POST");
    await dialog.getByRole("button", { name: "Enviar" }).click();
    const started = await loginResponse;
    realExpect(started.status()).toBe(201);
    await realExpect.poll(() => loginResponseSize(page)).toBe(0);
    realExpect(started.headers()["x-session-id"] === undefined).toBe(true);
    await realExpect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "ca_sesion"))
      .toBe(true);
    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "ca_sesion");
    realExpect(session?.httpOnly).toBe(true);
    realExpect(session?.sameSite).toBe("Lax");
    realExpect(session?.path).toBe("/");
    realExpect(session?.secure).toBe(false);
    realExpect(await page.evaluate(() => document.cookie.includes("ca_sesion"))).toBe(false);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await realExpect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    await page.reload();
    await realExpect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();

    await beforeMutation();
    const logoutResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === logoutPath && response.request().method() === "DELETE");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    const closed = await logoutResponse;
    sessionClosed = closed.status() === 204;
    realExpect(closed.request().postData()).toBeNull();
    realExpect(new URL(closed.request().url()).search).toBe("");
    realExpect(closed.request().headers()["x-session-id"]).toBeUndefined();
    realExpect(closed.request().headers()["x-service-token"]).toBeUndefined();
    realExpect(closed.status()).toBe(204);
    await realExpect.poll(() => logoutResponseSize(page)).toBe(0);
    await realExpect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "ca_sesion"))
      .toBe(false);
    await page.reload();
    await realExpect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
    // Una cookie ficticia solo cambia el estado visual: no confirma validez en Spring Boot.
    await context.addCookies([{ name: "ca_sesion", value: "synthetic-visual-only", url: base.origin,
      httpOnly: true, sameSite: "Lax" }]);
    await page.reload();
    await realExpect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    realExpect(browserSentInternalHeader).toBe(false);
  } finally {
    // El request context comparte la cookie; el test no extrae su valor.
    const outcome = await attemptSessionCleanup({
      loginDispatched,
      logoutConfirmed: sessionClosed,
      hasCookie: async () => (await context.cookies()).some((cookie) => cookie.name === "ca_sesion"),
      beforeMutation,
      deleteSession: async () => (await context.request.delete(base.origin + logoutPath)).status(),
    });
    if (outcome === "unrecoverable-no-cookie") {
      console.log("Inicio enviado sin cookie recuperable: no existe cierre seguro por la API actual.");
    } else if (outcome === "unconfirmed") {
      console.log("No se confirmó el cierre de contingencia de la sesión sintética.");
    } else if (outcome === "http-204-cookie-cleared") {
      console.log("Cierre de contingencia: DELETE 204 y cookie eliminada; persistencia no verificada.");
    }
  }
});
