import type { Page, Route } from "playwright/test";
import { test, expect, fixtureEmail, fixtureServiceSecret, identificationPath, type Scenario } from "./fixtures";

function controls(page: Page) {
  const form = page.getByRole("form", { name: "Identificación por correo" });
  return {
    form,
    input: form.getByLabel("Correo electrónico"),
    submit: form.getByRole("button"),
    status: form.getByRole("status"),
    alert: form.getByRole("alert"),
  };
}

async function openForm(page: Page) {
  // Único punto de acceso a la UI: si se mueve a un modal, abrirlo aquí.
  // Las comprobaciones usan solo los controles accesibles del formulario.
  await page.goto("/");
  const ui = controls(page);
  await expect(ui.form, "El formulario de identificación debe estar accesible").toBeVisible();
  return ui;
}

async function checkBrowserPrivacy(page: Page) {
  const stored = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  expect(stored.toLowerCase().includes(fixtureEmail.toLowerCase()) || stored.includes(fixtureServiceSecret),
    "El correo y el token no deben quedar en almacenamiento ni cookies del navegador").toBe(false);
  expect((await page.context().cookies()).length).toBe(0);
  const text = await controls(page).form.innerText();
  expect(/usuarioId|synthetic-secret/.test(text) ||
    text.includes(fixtureEmail) || text.includes(fixtureServiceSecret)).toBe(false);
}

async function checkFailure(page: Page, message: string | RegExp) {
  const ui = controls(page);
  await expect(ui.alert).toContainText(message);
  await expect(ui.alert).toBeVisible();
  await expect(ui.submit).toBeEnabled();
  await expect(ui.form).toHaveAttribute("aria-busy", "false");
  await expect(ui.status).toBeEmpty();
  // Comparar booleanos evita imprimir el valor ingresado si falla el test.
  expect(await ui.input.inputValue() === fixtureEmail, "El texto ingresado se conserva tras el error").toBe(true);
  await checkBrowserPrivacy(page);
}

test("HTTP local: el BFF real usa el upstream simulado y conserva el 204 vacío", async ({ request, scenario }) => {
  const response = await request.post(identificationPath, {
    data: { email: fixtureEmail },
    headers: { "X-Service-Token": "forged-client-token" },
  });
  expect(response.status()).toBe(204);
  expect((await response.body()).length).toBe(0);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["set-cookie"] === undefined).toBe(true);
  expect(response.headers()["x-service-token"] === undefined).toBe(true);
  expect(scenario.received).toEqual([{
    method: "POST", path: identificationPath, validContract: true,
    forwardedCredentials: false, validServiceToken: true,
  }]);
});

test("UI: teclado y aviso declarativo dentro del formulario", async ({ page }) => {
  const ui = await openForm(page);
  await expect(ui.form.getByText(/Podés declarar tu correo/)).toBeVisible();
  await expect(ui.input).toHaveAccessibleDescription(/toda la dirección se convierte a minúsculas/);
  await expect(ui.input).toHaveAccessibleDescription(/incompatible con proveedores que distinguen mayúsculas y minúsculas/);
  await expect(ui.input).toHaveAccessibleDescription(/No se verifica su titularidad ni se inicia una sesión/);

  // Comprobar el orden de teclado dentro del formulario, sin recorrer su contenedor.
  await ui.submit.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(ui.input).toBeFocused();
  await page.keyboard.type(fixtureEmail);
  expect(await ui.input.inputValue() === fixtureEmail).toBe(true);
  await page.keyboard.press("Tab");
  await expect(ui.submit).toBeFocused();
  expect(await ui.submit.evaluate((element) => getComputedStyle(element).outlineStyle !== "none")).toBe(true);
  await checkBrowserPrivacy(page);
});

test("UI: el formulario conserva su disposición entre 320 y 1536 px", async ({ page }) => {
  const { form, input } = await openForm(page);
  for (const width of [320, 375, 390, 639, 640, 641, 767, 768, 769, 1023, 1024, 1025, 1280, 1536]) {
    await page.setViewportSize({ width, height: 1000 });
    await form.scrollIntoViewIfNeeded();
    const box = await form.boundingBox();
    const field = await input.boundingBox();
    expect(box !== null && field !== null && box.x >= 0 && box.x + box.width <= width &&
      field.x >= box.x && field.x + field.width <= box.x + box.width,
    `Formulario y campo contenidos a ${width}px`).toBe(true);
    expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});

test("UI: correo ausente o claramente inválido no inicia solicitudes", async ({ page, scenario }) => {
  const { input, submit } = await openForm(page);
  await submit.click();
  expect(await input.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await expect(input).toBeFocused();
  await input.fill("sin-arroba");
  await submit.click();
  expect(await input.evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBe(true);
  expect(await input.evaluate((element: HTMLInputElement) => element.validationMessage.length > 0)).toBe(true);
  expect(scenario.submissions).toBe(0);
  expect(scenario.received.length).toBe(0);
});

test("UI + BFF real: carga, doble envío, confirmación neutra y privacidad", async ({ page, scenario }) => {
  scenario.mode = "defer";
  const ui = await openForm(page);
  await ui.input.fill(fixtureEmail);
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === identificationPath);
  await ui.submit.click();
  await expect(ui.submit).toHaveText("Enviando…");
  await expect(ui.submit).toBeDisabled();
  await expect(ui.form).toHaveAttribute("aria-busy", "true");
  await expect(ui.input).toHaveJSProperty("readOnly", true);
  await ui.input.press("Enter");
  await expect.poll(() => !!scenario.pending).toBe(true);
  expect(scenario.received.length).toBe(1);
  expect(scenario.submissions).toBe(1);
  scenario.pending!.writeHead(204, {
    "Set-Cookie": "identity=synthetic-secret",
    "X-User-Id": "synthetic-secret",
    "X-Service-Token": fixtureServiceSecret,
  });
  scenario.pending!.end();
  const response = await pending;
  expect(response.status()).toBe(204);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["set-cookie"] === undefined).toBe(true);
  expect(response.headers()["x-user-id"] === undefined).toBe(true);
  expect(response.headers()["x-service-token"] === undefined).toBe(true);
  await expect(ui.status).toHaveText("Identificación recibida. No se verificó la titularidad del correo ni se inició una sesión.");
  await expect(ui.status).toHaveAttribute("aria-live", "polite");
  await expect(ui.alert).toBeEmpty();
  await expect(ui.submit).toBeEnabled();
  expect((await ui.input.inputValue()).length).toBe(0);
  await checkBrowserPrivacy(page);
  const reopened = await openForm(page);
  expect((await reopened.input.inputValue()).length).toBe(0);
  expect(scenario.received.length).toBe(1);
  expect(scenario.submissions).toBe(1);
});

// Conserva los escenarios del script de navegador anterior como casos aislados.
const upstreamErrors: [Scenario["mode"], number, string][] = [
  [400, 400, "formato válido"],
  [413, 413, "tamaño permitido"],
  [415, 415, "formato requerido"],
  [429, 429, "límite de solicitudes"],
  [500, 502, "identificación no está disponible"],
  [200, 502, "identificación no está disponible"],
  ["disconnect", 502, "No se pudo confirmar la operación"],
  ["timeout", 504, "No se pudo confirmar la operación a tiempo"],
];
for (const [mode, status, message] of upstreamErrors) {
  test(`UI + BFF real: upstream ${mode} produce ${status} sin reintentos`, async ({ page, scenario }) => {
    scenario.mode = mode;
    const ui = await openForm(page);
    await ui.input.fill(fixtureEmail);
    // El BFF vence a los 5 s; dejar margen acotado para recibir su respuesta 504.
    const pending = page.waitForResponse(
      (response) => new URL(response.url()).pathname === identificationPath,
      { timeout: mode === "timeout" ? 8_000 : 5_000 },
    );
    await ui.submit.click();
    const response = await pending;
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-service-token"] === undefined).toBe(true);
    if (status === 429) expect(response.headers()["retry-after"]).toBe("60");
    await checkFailure(page, message);
    expect(scenario.submissions).toBe(1);
    expect(scenario.received.length).toBe(1);
  });
}

for (const [fault, message] of [
  ["connection", "Revisá tu conexión"],
  ["timeout", "No se pudo confirmar la operación a tiempo"],
  ["configuration", "identificación no está disponible"],
] as const) {
  test(`UI con BFF interceptado: ${fault} conserva el texto y permite reintento manual`, async ({ page, scenario, baseURL }) => {
    const ui = await openForm(page);
    let intercepted: Route | undefined;
    await page.route(baseURL + identificationPath, (route) => {
      intercepted = route;
      if (fault === "connection") return route.abort("connectionreset");
      if (fault === "configuration") {
        return route.fulfill({ status: 503, contentType: "application/json", body: '{"codigo":"SERVICIO_NO_DISPONIBLE","mensaje":"synthetic-secret"}' });
      }
      // El AbortSignal nativo del formulario vence a los 10 segundos.
    });
    try {
      await ui.input.fill(fixtureEmail);
      await ui.submit.click();
      await expect.poll(() => intercepted !== undefined).toBe(true);
      await expect(ui.submit).toBeEnabled({ timeout: 12_000 });
      await checkFailure(page, message);
      expect(scenario.submissions).toBe(1);
      expect(scenario.received.length).toBe(0);
    } finally {
      if (fault === "timeout") await intercepted?.abort().catch(() => {});
    }
  });
}
