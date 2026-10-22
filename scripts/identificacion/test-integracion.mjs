import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve, relative, sep, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { integrationEnvironment } from "./dev-integracion.mjs";

const endpoint = "/api/usuarios/identificacion";
const sessionsEndpoint = "/api/usuarios/sesiones";
const logoutEndpoint = "/api/usuarios/sesiones/actual";
const configName = ".env.integracion.local";
const authorizedDatabaseName = "conciencia_alimentaria_test";
const authorizedDatabaseUser = "conciencia_app_test";
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function fail(message) { throw new Error(message); }
function inside(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function readableIntegrationFile(root, configured, label) {
  if (!configured?.trim()) fail(`${configName} debe definir ${label} no vacío.`);
  const path = resolve(root, configured);
  try {
    const actual = await realpath(path);
    const info = await stat(actual);
    if (!info.isFile()) fail(`${label} debe ser un archivo legible.`);
    if ((info.mode & 0o444) === 0) fail(`${label} debe ser un archivo legible.`);
    await access(actual, constants.R_OK);
    const publicPath = resolve(root, "public");
    const actualPublicPath = await realpath(publicPath).catch(() => publicPath);
    if (inside(publicPath, path) || inside(actualPublicPath, actual)) {
      fail(`${label} no puede estar en public/.`);
    }
    return actual;
  } catch (error) {
    if (error.message?.includes(label)) throw error;
    fail(`${label} debe existir y ser un archivo legible.`);
  }
}

export function parseTestDatabase(urlText, expectedName) {
  if (!urlText?.trim() || !expectedName?.trim()) fail("Faltan TEST_DB_URL o TEST_DB_EXPECTED_NAME.");
  let url;
  try { url = new URL(urlText.trim().replace(/^jdbc:/, "")); }
  catch { fail("TEST_DB_URL debe ser JDBC PostgreSQL local con puerto y base explícitos."); }
  if (!urlText.trim().startsWith("jdbc:postgresql://") ||
      url.protocol !== "postgresql:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !url.port || url.username || url.password || url.search || url.hash ||
      !/^\/[A-Za-z_][A-Za-z0-9_-]*$/.test(url.pathname)) {
    fail("TEST_DB_URL debe ser JDBC PostgreSQL local con puerto y base explícitos, sin opciones ni credenciales.");
  }
  const port = Number(url.port);
  const database = url.pathname.slice(1);
  if (port < 1 || port > 65535 || database !== authorizedDatabaseName ||
      expectedName !== authorizedDatabaseName) {
    fail("Destino PostgreSQL de prueba no coincide con conciencia_alimentaria_test.");
  }
  return { host: url.hostname === "[::1]" ? "::1" : url.hostname, port, database };
}

export function validateYaml(source) {
  const maps = new Set(["spring", "spring.datasource", "spring.datasource.hikari",
    "spring.jpa", "spring.jpa.hibernate", "spring.sql", "spring.sql.init",
    "logging", "logging.level"]);
  const required = new Map([
    ["spring.datasource.url", "${TEST_DB_URL}"],
    ["spring.datasource.username", "${TEST_DB_USERNAME}"],
    ["spring.datasource.password", "${TEST_DB_PASSWORD}"],
    ["spring.jpa.hibernate.ddl-auto", "none"],
  ]);
  const seen = new Map();
  const parents = [];
  const invalid = () => fail("application-test.yml contiene propiedades o valores no permitidos para esta prueba.");
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (raw.includes("\t")) invalid();
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    const match = /^( *)([A-Za-z][A-Za-z0-9_.-]*):(?: (.*))?$/.exec(line);
    if (!match || match[1].length % 2) invalid();
    const depth = match[1].length / 2;
    if (depth > parents.length) invalid();
    parents.length = depth;
    const key = [...parents, match[2]].join(".");
    if (seen.has(key)) invalid();
    const value = match[3]?.trim() ?? "";
    seen.set(key, value);
    if (!value) {
      if (!maps.has(key)) invalid();
      parents.push(match[2]);
      continue;
    }
    if (required.has(key)) {
      if (value !== required.get(key)) invalid();
    } else if (key === "spring.datasource.hikari.connection-timeout") {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) invalid();
    } else if (key === "spring.jpa.show-sql") {
      if (!/^(true|false)$/i.test(value)) invalid();
    } else if (key === "spring.sql.init.mode") {
      if (value !== "never") invalid();
    } else if (key.startsWith("logging.level.") && key.length > "logging.level.".length) {
      if (!/^(TRACE|DEBUG|INFO|WARN|ERROR|OFF)$/i.test(value)) invalid();
    } else invalid();
  }
  for (const key of required.keys()) {
    if (!seen.has(key)) invalid();
  }
}

export async function configuration(root, inherited = process.env) {
  const frontendEnv = integrationEnvironment(root, inherited);
  let parsed;
  try { parsed = parseEnv(await readFile(resolve(root, configName), "utf8")); }
  catch { fail(`No se pudo leer ${configName}.`); }
  const jar = await readableIntegrationFile(root, parsed.BACKEND_JAR_PATH, "BACKEND_JAR_PATH");
  const yaml = await readableIntegrationFile(root, parsed.BACKEND_TEST_CONFIG_PATH, "BACKEND_TEST_CONFIG_PATH");
  if (!jar.endsWith(".jar")) fail("BACKEND_JAR_PATH debe apuntar a un JAR.");
  if (!yaml.endsWith("application-test.yml")) fail("BACKEND_TEST_CONFIG_PATH debe apuntar a application-test.yml.");
  validateYaml(await readFile(yaml, "utf8"));
  const siblings = await readdir(dirname(yaml));
  if (siblings.some((name) => /^application-test-test\.(?:yml|yaml|properties)$/.test(name))) {
    fail("El YAML externo tiene una variante de perfil capaz de sobrescribir sus propiedades.");
  }
  for (const name of ["TEST_DB_URL", "TEST_DB_USERNAME", "TEST_DB_PASSWORD", "TEST_DB_EXPECTED_NAME",
    "TEST_DB_EXPECTED_COMMENT"]) {
    if (!inherited[name]?.trim()) fail(`Falta ${name} en la terminal.`);
  }
  const database = parseTestDatabase(inherited.TEST_DB_URL, inherited.TEST_DB_EXPECTED_NAME);
  if (inherited.TEST_DB_USERNAME !== authorizedDatabaseUser) {
    fail("TEST_DB_USERNAME no coincide con el rol de pruebas autorizado.");
  }
  const backendUrl = new URL(frontendEnv.BACKEND_URL);
  if (!backendUrl.port) fail("BACKEND_URL debe declarar el puerto HTTP del JAR explícitamente.");
  if (!["127.0.0.1", "localhost"].includes(backendUrl.hostname)) {
    fail("test:integracion exige BACKEND_URL local para coincidir con el JAR.");
  }
  const backendPort = Number(backendUrl.port);
  const frontendPort = Number(parsed.INTEGRATION_FRONTEND_PORT ?? "3100");
  if (!Number.isInteger(frontendPort) || frontendPort < 1024 || frontendPort > 65535 || frontendPort === backendPort) {
    fail("INTEGRATION_FRONTEND_PORT debe ser un puerto válido distinto al del backend.");
  }
  return { jar, yaml, database, backendPort, frontendPort, backendUrl: frontendEnv.BACKEND_URL,
    secret: frontendEnv.BFF_SERVICE_SECRET, dbUrl: inherited.TEST_DB_URL,
    dbUser: inherited.TEST_DB_USERNAME, dbPassword: inherited.TEST_DB_PASSWORD,
    expectedName: inherited.TEST_DB_EXPECTED_NAME, expectedComment: inherited.TEST_DB_EXPECTED_COMMENT };
}

export async function assertPortFree(port) {
  const server = createServer();
  try {
    await new Promise((ok, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", ok);
    });
  } catch { fail(`Puerto local ${port} ocupado o no disponible; no se reutiliza.`); }
  finally { if (server.listening) await new Promise((done) => server.close(done)); }
}

async function descendsFrom(pid, ownerPid) {
  for (let i = 0; i < 20 && pid > 1; i++) {
    if (pid === ownerPid) return true;
    const statText = await readFile(`/proc/${pid}/stat`, "utf8");
    const afterName = statText.slice(statText.lastIndexOf(")") + 2).split(" ");
    pid = Number(afterName[1]);
  }
  return false;
}

export async function assertRealE2EProcessTree(backendPid, orchestratorPid, workerPid) {
  if (![backendPid, orchestratorPid, workerPid].every((pid) => Number.isSafeInteger(pid) && pid > 1) ||
      !(await descendsFrom(backendPid, orchestratorPid)) ||
      !(await descendsFrom(workerPid, orchestratorPid))) {
    fail("Playwright real no pertenece al mismo orquestador que el JAR.");
  }
}

export async function assertOwnedPort(port, owner) {
  // La suite real se ejecuta en Linux: ss informa el PID del socket en LISTEN.
  // Si no se puede comprobar la propiedad, se aborta antes de escribir.
  const result = spawnSync("ss", ["-H", "-ltnp", "sport", "=", `:${port}`],
    { encoding: "utf8", timeout: 3000, env: { PATH: process.env.PATH ?? "" } });
  if (result.status !== 0 || result.error) fail("No se pudo comprobar el propietario del puerto local.");
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 1) fail("El puerto local no tiene un único listener verificable.");
  const pids = [...lines[0].matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
  if (!pids.length || !owner.pid) fail("El listener local no expone un PID verificable.");
  try {
    for (const pid of pids) {
      if (!(await descendsFrom(pid, owner.pid))) fail("El puerto local pertenece a otro proceso.");
    }
  } catch (error) {
    if (error.message === "El puerto local pertenece a otro proceso.") throw error;
    fail("No se pudo verificar el árbol de procesos del listener local.");
  }
}

export function backendEnvironment(config, inherited = process.env) {
  // Lista cerrada: no llegan DB_*, SPRING_DATASOURCE_*, JAVA_TOOL_OPTIONS,
  // SPRING_APPLICATION_JSON ni variables de Redis/QStash/owner/fichas.
  return {
    PATH: inherited.PATH ?? "", LANG: inherited.LANG ?? "C", HOME: "/nonexistent",
    BFF_SERVICE_SECRET: config.secret,
    TEST_DB_URL: config.dbUrl, TEST_DB_USERNAME: config.dbUser,
    TEST_DB_PASSWORD: config.dbPassword,
    SPRING_PROFILES_ACTIVE: "test",
  };
}

export function frontendEnvironment(config, root, inherited = process.env) {
  const env = integrationEnvironment(root, { PATH: inherited.PATH ?? "", LANG: inherited.LANG ?? "C" });
  env.BACKEND_URL = config.backendUrl;
  env.BFF_SERVICE_SECRET = config.secret;
  env.PORT = String(config.frontendPort);
  env.NEXT_TELEMETRY_DISABLED = "1";
  return env;
}

export function readOnlyPreflight(config, execute = spawnSync) {
  if (!config.expectedComment?.trim()) fail("Falta TEST_DB_EXPECTED_COMMENT; no se iniciará el JAR.");
  const result = execute("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
    "SELECT current_database(), current_user, current_setting('transaction_read_only') = 'on', (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname = current_user), NOT EXISTS (SELECT 1 FROM pg_database WHERE datname <> current_database() AND datallowconn AND has_database_privilege(current_user, oid, 'CONNECT')), encode(convert_to((SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database()), 'UTF8'), 'hex');"], {
    encoding: "utf8", timeout: 10000,
    env: psqlEnvironment(config),
  });
  assertReadOnlyPreflightResult(result, config);
}

export function assertNoKnownJarInitializers(jar, execute = spawnSync) {
  const result = execute("unzip", ["-Z1", jar], {
    encoding: "utf8", timeout: 20000, maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.status !== 0 || result.error || typeof result.stdout !== "string") {
    fail("No se pudo verificar el índice del JAR antes del arranque.");
  }
  const suspicious = result.stdout.split("\n").some((name) =>
    /^BOOT-INF\/lib\/.*(?:flyway|liquibase)/i.test(name) ||
    /^BOOT-INF\/classes\/(?:db\/migration|db\/changelog|liquibase)(?:\/|$)/i.test(name) ||
    /^BOOT-INF\/classes\/(?:.*\/)?(?:schema|data)(?:-[^/]*)?\.sql$/i.test(name) ||
    /^BOOT-INF\/classes\/.*(?:Runner|Initializer|Migration|Seeder|Bootstrap|DataLoader)\.class$/i.test(name));
  if (suspicious) fail("El JAR contiene posibles migraciones o inicializadores de arranque.");
}

function psqlEnvironment(config) {
  return { PATH: process.env.PATH ?? "", PGHOST: config.database.host,
    PGPORT: String(config.database.port), PGDATABASE: config.database.database,
    PGUSER: config.dbUser, PGPASSWORD: config.dbPassword,
    PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "5" };
}

export function assertReadOnlyPreflightResult(result, config) {
  if (!config.expectedComment?.trim()) fail("Falta TEST_DB_EXPECTED_COMMENT; no se iniciará el JAR.");
  if (result.status !== 0 || result.error || typeof result.stdout !== "string") {
    fail("Falló la consulta PostgreSQL solo lectura; no se iniciará el JAR.");
  }
  const row = result.stdout.trim().split("|");
  if (row.length !== 6 || row[0] !== authorizedDatabaseName ||
      row[0] !== config.database.database || row[1] !== config.dbUser ||
      row[2] !== "t" || row[3] !== "t") {
    fail("La consulta solo lectura no confirmó la base de prueba y el rol limitado a ella.");
  }
  if (!row[5]) fail("El comentario administrativo de la base de pruebas es nulo o vacío.");
  if (row[5] !== Buffer.from(config.expectedComment, "utf8").toString("hex")) {
    fail("El comentario administrativo de la base de pruebas no coincide con el valor autorizado.");
  }
}

function socketAddress(value) {
  const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(value);
  if (!match) fail("No se pudo interpretar un socket TCP del proceso Java.");
  return { host: (match[1] ?? match[2]).replace(/^::ffff:/, ""), port: Number(match[3]) };
}

export function parseEstablishedSockets(output) {
  return output.split("\n").filter(Boolean).map((line) => {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4) fail("No se pudo interpretar la lista de sockets TCP.");
    return { local: socketAddress(columns[2]), peer: socketAddress(columns[3]),
      pids: [...line.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1])) };
  });
}

export function parseActivityRows(output) {
  if (!output.trim()) return [];
  return output.trim().split("\n").map((line) => {
    const fields = line.split("|");
    if (fields.length !== 5 || !/^\d+$/.test(fields[3])) {
      fail("No se pudo interpretar pg_stat_activity.");
    }
    return { database: fields[0], user: fields[1],
      clientHost: fields[2].replace(/^::ffff:/, ""), clientPort: Number(fields[3]),
      backendType: fields[4] };
  });
}

function loopback(host) { return host === "127.0.0.1" || host === "::1"; }

export function assertDatasourceEvidence(sockets, activity, config) {
  const outbound = sockets.filter((socket) => socket.local.port !== config.backendPort);
  if (!outbound.length) fail("No se observó una conexión PostgreSQL del JAR antes del POST.");
  for (const socket of outbound) {
    if (!loopback(socket.local.host) || !loopback(socket.peer.host) ||
        socket.peer.port !== config.database.port) {
      fail("El JAR tiene una conexión TCP ajena al PostgreSQL de pruebas.");
    }
    const matches = activity.filter((row) => row.clientHost === socket.local.host &&
      row.clientPort === socket.local.port);
    if (matches.length !== 1) {
      const samePort = activity.filter((row) => row.clientPort === socket.local.port);
      const family = (host) => host.includes(":") ? "IPv6" : "IPv4";
      const reason = samePort.length ?
        `dirección de cliente discordante (${family(socket.local.host)} frente a ${[...new Set(samePort.map((row) => family(row.clientHost)))].join("/")})` :
        "sesión ausente";
      fail(`No se pudo vincular el socket del JAR en pg_stat_activity: ${reason}.`);
    }
    if (matches[0].database !== config.database.database) {
      fail("No se pudo vincular el socket del JAR en pg_stat_activity: base discordante.");
    }
    if (matches[0].user !== config.dbUser) {
      fail("No se pudo vincular el socket del JAR en pg_stat_activity: rol discordante.");
    }
    if (matches[0].backendType !== "client backend") {
      fail("No se pudo vincular el socket del JAR en pg_stat_activity: tipo de sesión discordante.");
    }
  }
}

export async function assertEffectiveDatasource(config, backend, timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (backend.startError || !running(backend)) fail("El JAR terminó antes de verificar su datasource.");
    const socketsResult = spawnSync("ss", ["-H", "-t", "-n", "-p", "state", "established"],
      { encoding: "utf8", timeout: 3000, env: { PATH: process.env.PATH ?? "" } });
    if (socketsResult.status !== 0 || socketsResult.error) {
      fail("No se pudo observar los sockets TCP del JAR.");
    }
    const owned = [];
    for (const socket of parseEstablishedSockets(socketsResult.stdout)) {
      for (const pid of socket.pids) {
        if (await descendsFrom(pid, backend.pid)) { owned.push(socket); break; }
      }
    }
    if (owned.length) {
      const result = spawnSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c",
        "SELECT datname, usename, host(client_addr), client_port, backend_type FROM pg_stat_activity WHERE client_addr IS NOT NULL AND client_port > 0;"],
      { encoding: "utf8", timeout: 10000, env: psqlEnvironment(config) });
      if (result.status !== 0 || result.error) {
        fail("No se pudo consultar pg_stat_activity en modo solo lectura.");
      }
      assertDatasourceEvidence(owned, parseActivityRows(result.stdout), config);
      return;
    }
    await delay(250);
  }
  fail("No se observó una conexión PostgreSQL del JAR antes del POST.");
}

export function startOwned(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true, stdio: options.stdio ?? "ignore" });
  child.on("error", () => { child.startError = true; });
  return child;
}

export function observeTestProfile(child) {
  let tail = "";
  child.testProfileSeen = false;
  child.stdout?.on("data", (chunk) => {
    tail = (tail + chunk.toString("utf8")).slice(-512);
    if (/The following 1 profile is active: ["']?test["']?\s*(?:\r?\n|$)/.test(tail)) {
      child.testProfileSeen = true;
    }
  });
  child.stderr?.resume();
}

export function playwrightEnvironment(config, backendPid, base, inherited = process.env) {
  return {
    PATH: inherited.PATH ?? "", LANG: inherited.LANG ?? "C", HOME: inherited.HOME ?? "/nonexistent",
    E2E_REAL_BASE_URL: base, E2E_REAL_BACKEND_PID: String(backendPid),
    E2E_REAL_BACKEND_PORT: String(config.backendPort),
    E2E_REAL_ORCHESTRATOR_PID: String(process.pid),
    TEST_DB_URL: config.dbUrl, TEST_DB_USERNAME: config.dbUser,
    TEST_DB_PASSWORD: config.dbPassword,
    TEST_DB_EXPECTED_NAME: config.expectedName,
    TEST_DB_EXPECTED_COMMENT: config.expectedComment,
    NEXT_TELEMETRY_DISABLED: "1", PLAYWRIGHT_NO_COPY_PROMPT: "1",
  };
}

async function waitOwnedExit(child) {
  const code = await new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("No se pudo iniciar Playwright.")));
    child.once("exit", (exitCode) => resolve(exitCode));
  });
  if (code !== 0) fail("Playwright real falló; se detiene la integración.");
}

function running(child) { return child.exitCode === null && child.signalCode === null; }
function groupAlive(pid) {
  try { process.kill(-pid, 0); return true; }
  catch { return false; }
}

export async function stopOwned(child) {
  if (!child?.pid || child.ownedStopRequested) return;
  child.ownedStopRequested = true;
  try { process.kill(-child.pid, "SIGTERM"); } catch { return; }
  for (let i = 0; i < 30 && groupAlive(child.pid); i++) await delay(100);
  if (groupAlive(child.pid)) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* grupo ya finalizado */ }
    await delay(100);
    if (groupAlive(child.pid)) console.error("No se pudo confirmar la liberación de un grupo de procesos propio.");
  }
}

export async function waitReady(url, child, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (child.startError || !running(child)) fail("Un servicio terminó antes del readiness.");
    try {
      const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(1000), redirect: "manual" });
      await response.body?.cancel();
      if (response.status > 0) return;
    } catch { /* aún no acepta conexiones */ }
    await delay(250);
  }
  fail("Readiness HTTP agotado.");
}

async function post(base, email, extraHeaders = {}) {
  const response = await fetch(`${base}${endpoint}`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ email }), signal: AbortSignal.timeout(8000) });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function sessionPost(base, email) {
  const response = await fetch(`${base}${sessionsEndpoint}`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    signal: AbortSignal.timeout(8000) });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

async function sessionDelete(base, cookie) {
  const response = await fetch(`${base}${logoutEndpoint}`, { method: "DELETE", redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.timeout(8000) });
  return { status: response.status, body: await response.text(), headers: response.headers };
}

function assertNoSensitiveResponse(response, ...secrets) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  for (const secret of secrets) {
    if (secret && response.body.includes(secret)) fail("Una respuesta expuso datos sensibles.");
  }
}

export function sessionCookie(response) {
  assert.equal(response.status, 201, "El inicio debe responder 201.");
  assert.equal(response.body, "", "201 no debe contener cuerpo.");
  const raw = response.headers.get("set-cookie");
  if (!raw) fail("El inicio no estableció la cookie de sesión.");
  const parts = raw.split(";").map((part) => part.trim());
  const match = /^ca_sesion=([^;]+)$/.exec(parts[0]);
  if (!match || !parts.some((part) => part.toLowerCase() === "httponly") ||
      !parts.some((part) => part.toLowerCase() === "samesite=lax") ||
      !parts.some((part) => part.toLowerCase() === "path=/") ||
      parts.some((part) => /^(?:expires|max-age)=/i.test(part))) {
    fail("La cookie de sesión no cumple el contrato.");
  }
  return parts[0];
}

function assertSafeNotRegistered(response, email, secret) {
  assert.equal(response.status, 404, "El correo no registrado debe producir 404.");
  assert.equal(response.headers.get("set-cookie"), null);
  assertNoSensitiveResponse(response, email, secret);
  let body;
  try { body = JSON.parse(response.body); } catch { fail("El 404 no contiene JSON seguro."); }
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  assert.equal(body.codigo, "CORREO_NO_REGISTRADO");
}

function assertSafeError(response, email, wrongSecret, serviceSecret, backendUrl) {
  assert.equal(response.status, 502, "El rechazo de la credencial técnica debe traducirse a 502.");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type")?.includes("application/json"), true);
  let body;
  try { body = JSON.parse(response.body); }
  catch { fail("La respuesta 502 no contiene JSON seguro."); }
  assert.deepEqual(Object.keys(body).sort(), ["codigo", "mensaje"]);
  if (body.codigo !== "SERVICIO_NO_DISPONIBLE") fail("Código de error BFF inesperado.");
  if ([email, wrongSecret, serviceSecret, backendUrl].some((value) => response.body.includes(value))) {
    fail("El error BFF expuso datos sensibles.");
  }
}

export function selectedIntegrationPhases(args) {
  if (args.length === 0) return ["http", "e2e", "wrong-secret"];
  if (args.length === 1 && args[0] === "--solo-e2e") return ["e2e"];
  fail("Selección de integración no reconocida.");
}

export async function run(root, { configure = configuration, checkPort = assertPortFree,
  preflight = readOnlyPreflight, inspectStartup = assertNoKnownJarInitializers,
  start = startOwned, phases = selectedIntegrationPhases([]) } = {}) {
  if (phases.length !== 1 || phases[0] !== "e2e") {
    if (phases.join(",") !== "http,e2e,wrong-secret") fail("Selección de integración no reconocida.");
  }
  const config = await configure(root);
  await checkPort(config.backendPort);
  await checkPort(config.frontendPort);
  preflight(config);
  inspectStartup(config.jar);
  console.log("Preflight local y PostgreSQL solo lectura: correcto. Iniciando servicios propios.");
  const children = [];
  let interrupted = false;
  const onSignal = () => { interrupted = true; for (const child of children) void stopOwned(child); };
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
  try {
    const backend = start("java", ["-jar", config.jar,
      `--spring.config.location=${pathToFileURL(config.yaml).href}`,
      "--spring.profiles.active=test", `--server.port=${config.backendPort}`,
      "--server.address=127.0.0.1", "--spring.jpa.hibernate.ddl-auto=none",
      "--spring.jpa.generate-ddl=false", "--spring.sql.init.mode=never",
      "--spring.flyway.enabled=false", "--spring.liquibase.enabled=false",
      "--spring.batch.jdbc.initialize-schema=never"],
      { cwd: root, env: backendEnvironment(config), stdio: ["ignore", "pipe", "pipe"] });
    children.push(backend);
    observeTestProfile(backend);
    await waitReady(`${config.backendUrl}${endpoint}`, backend, 45000);
    if (!backend.testProfileSeen) fail("No se confirmó el perfil test en el arranque de Spring Boot.");
    await assertOwnedPort(config.backendPort, backend);
    await assertEffectiveDatasource(config, backend);
    if (interrupted) fail("Ejecución interrumpida.");
    const frontend = startOwned(process.execPath, [resolve(root, "scripts/identificacion/dev-integracion.mjs")],
      { cwd: root, env: frontendEnvironment(config, root) });
    children.push(frontend);
    const base = `http://127.0.0.1:${config.frontendPort}`;
    await waitReady(`${base}${endpoint}`, frontend, 45000);
    await assertOwnedPort(config.frontendPort, frontend);
    if (interrupted) fail("Ejecución interrumpida.");
    if (phases.includes("http")) {
    const email = `integration-${randomUUID()}@example.com`;
    const unregistered = `integration-absent-${randomUUID()}@example.com`;
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    assertSafeNotRegistered(await sessionPost(base, unregistered), unregistered, config.secret);
    console.log("HTTP real: inicio con correo no registrado devuelve 404 sin cookie.");
    for (let i = 0; i < 2; i++) {
      await assertEffectiveDatasource(config, backend);
      readOnlyPreflight(config);
      const response = await post(base, email, { "X-Service-Token": "browser-synthetic-ignored" });
      assert.equal(response.status, 204, "El BFF debe devolver 204 para identificación declarativa.");
      if (response.body !== "") fail("204 debe carecer de cuerpo.");
      assertNoSensitiveResponse(response, email, config.secret);
    }
    console.log("HTTP real: 204 vacío y repetición del correo sintético confirmados.");
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const started = await sessionPost(base, email);
    const cookie = sessionCookie(started);
    assertNoSensitiveResponse(started, email, config.secret);
    if (started.headers.get("x-session-id") || started.headers.get("x-service-token")) {
      fail("El inicio expuso una cabecera interna.");
    }
    console.log("HTTP real: inicio 201 vacío y cookie HttpOnly comprobados.");
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const closed = await sessionDelete(base, cookie);
    assert.equal(closed.status, 204, "El cierre debe devolver 204.");
    assert.equal(closed.body, "", "204 de cierre debe carecer de cuerpo.");
    assertNoSensitiveResponse(closed, email, config.secret, cookie);
    const deletion = closed.headers.get("set-cookie");
    if (!deletion?.startsWith("ca_sesion=") || !/max-age=0|expires=/i.test(deletion)) {
      fail("El cierre no eliminó la cookie.");
    }
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const missingCookie = await sessionDelete(base);
    assert.equal(missingCookie.status, 204);
    assert.equal(missingCookie.body, "");
    assert.equal(missingCookie.headers.get("set-cookie"), null);
    console.log("HTTP real: cierre 204 y borrado de cookie; cierre sin cookie 204 local.");
    console.log("Persistencia no verificada; el registro sintético puede permanecer.");
    }
    if (phases.includes("e2e")) {
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const playwright = startOwned(process.execPath, [
      resolve(root, "node_modules/playwright/cli.js"), "test",
      "scripts/playwright/e2e/sesiones-ui.spec.ts", "--grep", "@real",
    ], { cwd: root, env: playwrightEnvironment(config, backend.pid, base),
      stdio: ["ignore", "inherit", "ignore"] });
    children.push(playwright);
    await waitOwnedExit(playwright);
    console.log("Playwright E2E real: caso de registro, inicio, cierre y F5 aprobado.");
    }
    if (!phases.includes("wrong-secret")) return;
    await stopOwned(frontend);
    if (interrupted) fail("Ejecución interrumpida.");
    await assertPortFree(config.frontendPort);
    const wrongSecret = `invalid-${randomUUID()}`;
    const wrongEnv = frontendEnvironment(config, root);
    wrongEnv.BFF_SERVICE_SECRET = wrongSecret;
    const next = resolve(root, "node_modules/next/dist/bin/next");
    const rejectedFrontend = startOwned(process.execPath,
      [next, "dev", "--webpack", "--hostname", "127.0.0.1"],
      { cwd: root, env: wrongEnv });
    children.push(rejectedFrontend);
    await waitReady(`${base}${endpoint}`, rejectedFrontend, 45000);
    await assertOwnedPort(config.frontendPort, rejectedFrontend);
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const rejectedEmail = `integration-rejected-${randomUUID()}@example.com`;
    const rejected = await post(base, rejectedEmail);
    assertSafeError(rejected, rejectedEmail, wrongSecret, config.secret, config.backendUrl);
    await assertEffectiveDatasource(config, backend);
    readOnlyPreflight(config);
    const rejectedSession = await sessionPost(base, rejectedEmail);
    assertSafeError(rejectedSession, rejectedEmail, wrongSecret, config.secret, config.backendUrl);
    assert.equal(rejectedSession.headers.get("set-cookie"), null);
    console.log("HTTP real: credencial técnica incorrecta traducida a error seguro en registro e inicio.");
  } finally {
    process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
    for (const child of children.reverse()) await stopOwned(child);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run(process.cwd(), { phases: selectedIntegrationPhases(process.argv.slice(2)) })
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
