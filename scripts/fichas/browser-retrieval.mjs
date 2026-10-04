import { isAbsolute } from "node:path";
import { createInterface } from "node:readline";
import { assertNoSecret, FichaError, isHttpUrl } from "./core.mjs";
import {
  HumanVerificationError,
  MAX_DOCUMENT_BYTES,
  retrieveDocument,
} from "./retrieval.mjs";

const RECOVERY_NOTE =
  "Recuperación en Chrome con sesión temporal, después de la confirmación humana de acceso. Se volvió a solicitar la URL original en esa misma sesión y se analizó la respuesta HTTP íntegra, no una reconstrucción del DOM. El navegador ejecutó JavaScript y recursos de la página; la confirmación no certifica cobertura ni aptitud editorial.";

function accessError(message) {
  return new FichaError(
    "RECUPERACION",
    "TEXTO_COMPLETO_NO_DISPONIBLE",
    message,
  );
}

// Only OS/display settings: API keys and the rest of .env.local stay in Node.
function browserEnvironment(env) {
  const names = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "WINDIR",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "XDG_RUNTIME_DIR",
    "XDG_SESSION_TYPE",
    "DBUS_SESSION_BUS_ADDRESS",
    "LANG",
    "LANGUAGE",
    "LC_ALL",
    "TZ",
  ];
  const result = Object.fromEntries(
    names
      .filter((name) => typeof env[name] === "string")
      .map((name) => [name, env[name]]),
  );
  assertNoSecret(result, env.GEMINI_API_KEY);
  return result;
}

async function launchChrome(options) {
  // Importing either CLI or reusing a ficha must not launch/load a browser.
  const { chromium } = await import("playwright-core");
  return chromium.launch(options);
}

export function waitForHuman({ input, output, signal }) {
  return new Promise((resolve, reject) => {
    const terminal = createInterface({ input, output, terminal: true });
    const cancel = () =>
      finish(accessError("Se canceló la verificación humana."));
    function finish(error) {
      signal.removeEventListener("abort", cancel);
      terminal.removeListener("SIGINT", cancel);
      terminal.removeListener("close", cancel);
      terminal.close();
      if (error) reject(error);
      else resolve();
    }
    function ask() {
      terminal.question(
        "Completá la verificación y, si aparece un panel de cookies, elegí tus preferencias. Cuando veas el artículo, volvé aquí y presioná Enter. Escribí cancelar para salir: ",
        (answer) => {
          if (answer.trim().toLowerCase() === "cancelar") cancel();
          else if (!answer.trim()) finish();
          else ask();
        },
      );
    }
    terminal.once("SIGINT", cancel);
    terminal.once("close", cancel);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted || input.destroyed || input.readableEnded) cancel();
    else ask();
  });
}

export async function retrieveInBrowser(
  url,
  {
    env = process.env,
    now,
    input = process.stdin,
    output = process.stderr,
    launchBrowser = launchChrome,
    confirmAccess = waitForHuman,
    timeoutMs = 10 * 60 * 1000,
    signals = process,
  } = {},
) {
  if (!input.isTTY || !output.isTTY)
    throw accessError(
      "El sitio requiere verificación humana. Ejecutá el comando en una terminal interactiva con escritorio y Chrome disponibles; no se abrió un navegador ni se solicitó IA.",
    );
  assertNoSecret([url, env.FICHAS_BROWSER_PATH], env.GEMINI_API_KEY);
  if (!isHttpUrl(url))
    throw accessError("La URL de acceso no es HTTP(S) válida.");
  if (env.FICHAS_BROWSER_PATH && !isAbsolute(env.FICHAS_BROWSER_PATH))
    throw accessError(
      "FICHAS_BROWSER_PATH debe ser una ruta absoluta a Chrome o Chromium.",
    );

  const controller = new AbortController();
  const { signal } = controller;
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  let browser;
  let page;
  let closing;
  const closeBrowser = () => {
    if (!browser) return Promise.resolve();
    closing ??= browser.close();
    return closing;
  };
  const closeOnAbort = () => {
    void closeBrowser().catch(() => {});
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  for (const name of ["SIGINT", "SIGTERM", "SIGHUP"])
    signals.on(name, cancel);
  let opened = false;
  let document;
  let diagnostic;
  try {
    output.write(
      "El sitio pide verificación. Abriendo Chrome en una sesión temporal (límite: 10 minutos).\n",
    );
    browser = await launchBrowser({
      ...(env.FICHAS_BROWSER_PATH
        ? { executablePath: env.FICHAS_BROWSER_PATH }
        : { channel: "chrome" }),
      headless: false,
      args: ["--start-maximized"],
      chromiumSandbox: true,
      env: browserEnvironment(env),
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      timeout: 30000,
    });
    opened = true;
    browser.on("disconnected", cancel);
    signal.throwIfAborted();
    // A fixed emulated viewport can put consent controls below the real window.
    // Let the user resize/maximize the window and have the page follow its size.
    const context = await browser.newContext({
      acceptDownloads: false,
      viewport: null,
    });
    page = await context.newPage();
    page.on("close", cancel);
    await page.goto(url, { waitUntil: "commit", timeout: 30000 });
    await confirmAccess({ input, output, signal });
    signal.throwIfAborted();
    output.write("Retomando la recuperación y comprobando el texto completo…\n");

    // Revisit the original URL: the user may have navigated to another page.
    // Keep this context's cookies, UA and browser network stack, not Node fetch.
    document = await retrieveDocument(url, {
      now,
      recoveryNote: RECOVERY_NOTE,
      fetchImpl: async (requestedUrl) => {
        signal.throwIfAborted();
        const response = await page.goto(requestedUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        if (!response || !isHttpUrl(response.url()))
          throw accessError(
            "El navegador no entregó una respuesta HTTP(S) del documento.",
          );
        assertNoSecret(response.url(), env.GEMINI_API_KEY);
        // Playwright joins multiple Set-Cookie values with LF, which Fetch
        // Headers rejects. Cookies already belong to the browser session;
        // only forward the headers needed to validate the document transfer.
        const headers = new Headers(
          Object.entries(await response.allHeaders()).filter(([name]) =>
            [
              "content-type",
              "content-length",
              "content-encoding",
              "content-range",
              "location",
            ].includes(name.toLowerCase()),
          ),
        );
        if (Number(headers.get("content-length")) > MAX_DOCUMENT_BYTES)
          throw accessError(
            "El documento del navegador supera el límite de 25 MiB.",
          );
        const bytes = await response.body();
        if (bytes.length > MAX_DOCUMENT_BYTES)
          throw accessError(
            "El documento del navegador supera el límite de 25 MiB.",
          );
        // Reuse transfer, format, truncation and coverage checks unchanged.
        const transfer = new Response(bytes, { headers });
        return {
          status: response.status(),
          url: response.url(),
          headers: transfer.headers,
          body: transfer.body,
        };
      },
    });
    signal.throwIfAborted();
  } catch (error) {
    if (signal.aborted)
      diagnostic = accessError(
        "La verificación se canceló, se cerró el navegador o se agotaron los 10 minutos de espera. Podés reintentar el mismo comando.",
      );
    else if (error instanceof HumanVerificationError)
      diagnostic = accessError(
        "La verificación sigue activa al recuperar el artículo en el navegador. No se obtuvo texto completo; podés reintentar el mismo comando.",
      );
    else if (error instanceof FichaError) diagnostic = error;
    else
      diagnostic = accessError(
        opened
          ? "No se pudo recuperar el documento en la sesión del navegador. No se solicitó IA; podés reintentar el mismo comando."
          : "No se pudo abrir Chrome. Verificá npm ci, un escritorio activo y Chrome instalado, o configurá FICHAS_BROWSER_PATH con la ruta absoluta a Chrome/Chromium.",
      );
  } finally {
    clearTimeout(timer);
    for (const name of ["SIGINT", "SIGTERM", "SIGHUP"])
      signals.off(name, cancel);
    signal.removeEventListener("abort", closeOnAbort);
    page?.off("close", cancel);
    browser?.off("disconnected", cancel);
    try {
      await closeBrowser();
    } catch {
      diagnostic ??= accessError(
        "No se pudo cerrar la sesión temporal de Chrome. Revisá la ventana antes de reintentar.",
      );
    }
  }
  if (diagnostic) throw diagnostic;
  return document;
}

export async function retrieveDocumentWithHumanVerification(url, options = {}) {
  try {
    return await retrieveDocument(url, options);
  } catch (error) {
    if (!(error instanceof HumanVerificationError)) throw error;
    return retrieveInBrowser(url, options);
  }
}
