import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const configName = ".env.integracion.local";
// Next.js carga .env.development.local, .env.local, .env.development y .env.
// Estas claves deben estar definidas en el entorno hijo para impedir que
// cualquiera de esos archivos reponga credenciales o destinos de desarrollo.
const blockedVariables = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "QSTASH_REGION",
  "QSTASH_URL",
  "QSTASH_TOKEN",
  "QSTASH_DEV_PORT",
  "EU_CENTRAL_1_QSTASH_CURRENT_SIGNING_KEY",
  "EU_CENTRAL_1_QSTASH_NEXT_SIGNING_KEY",
  "EU_CENTRAL_1_QSTASH_URL",
  "EU_CENTRAL_1_QSTASH_TOKEN",
  "US_EAST_1_QSTASH_CURRENT_SIGNING_KEY",
  "US_EAST_1_QSTASH_NEXT_SIGNING_KEY",
  "US_EAST_1_QSTASH_URL",
  "US_EAST_1_QSTASH_TOKEN",
  "OWNER_SECRET",
  "OWNER_COOKIE_SECRET",
  "SHOW_OWNER_BUTTON",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "FICHAS_DIR",
  "FICHAS_BROWSER_PATH",
];

export function integrationEnvironment(directory, inherited = process.env) {
  let parsed;
  try {
    parsed = parseEnv(readFileSync(join(directory, configName), "utf8"));
  } catch {
    throw new Error(`No se pudo leer ${configName}. Crealo desde .env.integracion.example.`);
  }

  const backendUrl = parsed.BACKEND_URL?.trim();
  const serviceSecret = parsed.BFF_SERVICE_SECRET;
  if (!backendUrl || !serviceSecret?.trim()) {
    throw new Error(`${configName} debe definir BACKEND_URL y BFF_SERVICE_SECRET no vacíos.`);
  }

  let url;
  try {
    url = new URL(backendUrl);
  } catch {
    throw new Error("BACKEND_URL debe ser un origen HTTP local válido.");
  }
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.pathname !== "/" ||
    backendUrl.includes("?") || backendUrl.includes("#")
  ) {
    throw new Error("BACKEND_URL debe ser un origen HTTP local sin path, credenciales ni parámetros.");
  }

  // Next.js conserva las variables presentes al cargar sus archivos .env*.
  // Los valores vacíos desactivan Redis/owner y evitan heredar configuración
  // de los scripts manuales; QSTASH_DEV requiere "false" explícito.
  const childEnv = { ...inherited };
  for (const name of blockedVariables) childEnv[name] = "";
  childEnv.QSTASH_DEV = "false";
  delete childEnv.BACKEND_URL;
  delete childEnv.BFF_SERVICE_SECRET;
  childEnv.BACKEND_URL = backendUrl;
  childEnv.BFF_SERVICE_SECRET = serviceSecret;
  childEnv.NODE_ENV = "development";
  return childEnv;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const env = integrationEnvironment(process.cwd());
    const next = new URL("../../node_modules/next/dist/bin/next", import.meta.url);
    const child = spawn(process.execPath, [fileURLToPath(next), "dev", "--webpack", "--hostname", "127.0.0.1"], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    });
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => child.kill(signal));
    }
    child.on("error", () => {
      console.error("No se pudo iniciar Next.js.");
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
