import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertDatasourceEvidence, assertOwnedPort, assertPortFree, assertReadOnlyPreflightResult,
  backendEnvironment, configuration, parseActivityRows, parseEstablishedSockets,
  parseTestDatabase, readableIntegrationFile, startOwned, stopOwned, validateYaml } from "./test-integracion.mjs";
import { waitReady } from "./test-integracion.mjs";

const validYaml = `spring:\n  datasource:\n    url: \${TEST_DB_URL}\n    username: \${TEST_DB_USERNAME}\n    password: \${TEST_DB_PASSWORD}\n  jpa:\n    hibernate:\n      ddl-auto: none\n`;
const extendedYaml = `# Configuración externa de prueba\nspring:\n  datasource:\n    url: \${TEST_DB_URL}\n    username: \${TEST_DB_USERNAME}\n    password: \${TEST_DB_PASSWORD}\n    hikari:\n      connection-timeout: 30000\n  jpa:\n    hibernate:\n      ddl-auto: none\n    show-sql: false\n  sql:\n    init:\n      mode: never\nlogging:\n  level:\n    com.zaxxer.hikari: INFO\n    org.hibernate.SQL: DEBUG\n    org.hibernate.orm.jdbc.bind: TRACE\n`;
const inherited = { PATH: process.env.PATH, BACKEND_JAR_PATH: "/ignored.jar",
  BACKEND_TEST_CONFIG_PATH: "/ignored.yml", BFF_SERVICE_SECRET: "terminal-secret",
  TEST_DB_URL: "jdbc:postgresql://127.0.0.1:5432/integration_test",
  TEST_DB_USERNAME: "integration_role", TEST_DB_PASSWORD: "synthetic-password",
  TEST_DB_EXPECTED_NAME: "integration_test", DB_URL: "development-db",
  SPRING_DATASOURCE_URL: "development-datasource", JAVA_TOOL_OPTIONS: "-Dunsafe=true" };

async function fixture(t, configLines = []) {
  const base = await mkdtemp(join(tmpdir(), "ca-real-int-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "frontend");
  await mkdir(join(root, "integration", "backend"), { recursive: true });
  await mkdir(join(root, "public"));
  await writeFile(join(base, "service.jar"), "synthetic jar");
  await writeFile(join(base, "application-test.yml"), validYaml);
  await writeFile(join(root, "integration", "backend", "service.jar"), "synthetic jar");
  await writeFile(join(root, "integration", "backend", "application-test.yml"), validYaml);
  await writeFile(join(root, ".env.local"),
    "BACKEND_URL=https://dev.example.com\nBFF_SERVICE_SECRET=development-secret\nBACKEND_JAR_PATH=../service.jar\nBACKEND_TEST_CONFIG_PATH=../application-test.yml\n");
  await writeFile(join(root, ".env.integracion.local"), [
    "BACKEND_URL=http://127.0.0.1:18080", "BFF_SERVICE_SECRET=file-synthetic-secret",
    ...configLines, ""].join("\n"));
  return { root, base };
}

test("JAR y YAML son obligatorios sin fallback a terminal o .env.local", async (t) => {
  const { root } = await fixture(t);
  await assert.rejects(configuration(root, inherited), /BACKEND_JAR_PATH/);
  await writeFile(join(root, ".env.integracion.local"),
    "BACKEND_URL=http://127.0.0.1:18080\nBFF_SERVICE_SECRET=file-secret\nBACKEND_JAR_PATH=../service.jar\n");
  await assert.rejects(configuration(root, inherited), /BACKEND_TEST_CONFIG_PATH/);
  await writeFile(join(root, ".env.integracion.local"),
    "BACKEND_URL=http://127.0.0.1:18080\nBFF_SERVICE_SECRET=file-secret\nBACKEND_JAR_PATH=   \nBACKEND_TEST_CONFIG_PATH=../application-test.yml\n");
  await assert.rejects(configuration(root, inherited), /BACKEND_JAR_PATH/);
});

test("admite JAR y YAML privados con rutas relativas desde la raíz frontend", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=./integration/backend/service.jar",
    "BACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml"]);
  const config = await configuration(root, inherited);
  assert.equal(config.jar, join(root, "integration", "backend", "service.jar"));
  assert.equal(config.yaml, join(root, "integration", "backend", "application-test.yml"));
  assert.equal(config.secret, "file-synthetic-secret");
  assert.equal(config.backendPort, 18080);
  assert.equal(config.frontendPort, 3100);
});

test("admite BACKEND_URL localhost y conserva el puerto configurado", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=./integration/backend/service.jar",
    "BACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml"]);
  await writeFile(join(root, ".env.integracion.local"),
    "BACKEND_URL=http://localhost:18080\nBFF_SERVICE_SECRET=file-synthetic-secret\nBACKEND_JAR_PATH=./integration/backend/service.jar\nBACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml\n");
  const config = await configuration(root, inherited);
  assert.equal(config.backendPort, 18080);
  assert.equal(config.backendUrl, "http://localhost:18080");
});

test("conserva archivos externos opcionales y rechaza faltantes, directorios e ilegibles", async (t) => {
  const { root, base } = await fixture(t, ["BACKEND_JAR_PATH=../service.jar",
    "BACKEND_TEST_CONFIG_PATH=../application-test.yml"]);
  const config = await configuration(root, inherited);
  assert.equal(config.jar, join(base, "service.jar"));
  assert.equal(config.yaml, join(base, "application-test.yml"));
  await assert.rejects(readableIntegrationFile(root, "./integration/backend/missing.jar", "BACKEND_JAR_PATH"), /legible/);
  await assert.rejects(readableIntegrationFile(root, "./integration/backend", "BACKEND_JAR_PATH"), /legible/);
  const unreadable = join(root, "integration", "backend", "unreadable.jar");
  await writeFile(unreadable, "synthetic jar");
  await chmod(unreadable, 0o000);
  try {
    await assert.rejects(readableIntegrationFile(root, "./integration/backend/unreadable.jar", "BACKEND_JAR_PATH"), /legible/);
  } finally { await chmod(unreadable, 0o600); }
});

test("rechaza rutas públicas directas y mediante symlink", async (t) => {
  const { root, base } = await fixture(t);
  await writeFile(join(root, "public", "service.jar"), "synthetic jar");
  await writeFile(join(root, "public", "application-test.yml"), validYaml);
  await assert.rejects(readableIntegrationFile(root, "./public/service.jar", "BACKEND_JAR_PATH"), /public/);
  await assert.rejects(readableIntegrationFile(root, "./public/application-test.yml", "BACKEND_TEST_CONFIG_PATH"), /public/);
  await symlink(join(root, "public", "service.jar"), join(base, "public-link.jar"));
  await assert.rejects(readableIntegrationFile(root, "../public-link.jar", "BACKEND_JAR_PATH"), /public/);
});

test("admite JDBC PostgreSQL local compatible y exige coincidencia de base", () => {
  assert.deepEqual(parseTestDatabase("jdbc:postgresql://localhost:5432/integration_test", "integration_test"),
    { host: "localhost", port: 5432, database: "integration_test" });
  assert.deepEqual(parseTestDatabase("jdbc:postgresql://[::1]:5433/pruebas", "pruebas"),
    { host: "::1", port: 5433, database: "pruebas" });
  assert.equal(parseTestDatabase(inherited.TEST_DB_URL, inherited.TEST_DB_EXPECTED_NAME).database, "integration_test");
});

test("rechaza destinos remotos, opciones JDBC y bases no confirmadas", () => {
  assert.throws(() => parseTestDatabase("jdbc:postgresql://db.example.com:5432/integration_test", "integration_test"), /local/);
  assert.throws(() => parseTestDatabase("jdbc:postgresql://localhost/integration_test", "integration_test"), /puerto/);
  assert.throws(() => parseTestDatabase("jdbc:postgresql://localhost:5432/integration_test?sslmode=require", "integration_test"), /opciones/);
  assert.throws(() => parseTestDatabase("jdbc:postgresql://user:pass@localhost:5432/integration_test", "integration_test"), /credenciales/);
  assert.throws(() => parseTestDatabase(inherited.TEST_DB_URL, "other_test"), /no coincide/);
  assert.throws(() => parseTestDatabase("jdbc:postgresql://localhost:5432/postgres", "postgres"), /no coincide/);
});

test("admite YAML con ajustes inocuos y rechaza overrides de seguridad", async (t) => {
  assert.doesNotThrow(() => validateYaml(extendedYaml));
  for (const source of [
    `${extendedYaml}spring.config.import: optional:file:/tmp/other\n`,
    extendedYaml.replace("mode: never", "mode: always"),
    extendedYaml.replace("ddl-auto: none", "ddl-auto: update"),
    extendedYaml.replace("url: ${TEST_DB_URL}", "url: jdbc:postgresql://localhost:5432/other"),
    `${extendedYaml}spring:\n  datasource:\n    url: \${TEST_DB_URL}\n`,
  ]) assert.throws(() => validateYaml(source), /no permitidos/);
  const { root, base } = await fixture(t, ["BACKEND_JAR_PATH=../service.jar",
    "BACKEND_TEST_CONFIG_PATH=../application-test.yml"]);
  await writeFile(join(base, "application-test.yml"), extendedYaml);
  await assert.doesNotReject(configuration(root, inherited));
  await writeFile(join(base, "application-test.yml"), `${validYaml}  profiles:\n    active: prod\n`);
  await assert.rejects(configuration(root, inherited), /no permitidos/);
  await writeFile(join(root, ".env.integracion.local"),
    "BACKEND_URL=http://remote.example.com:18080\nBFF_SERVICE_SECRET=file-secret\nBACKEND_JAR_PATH=../service.jar\nBACKEND_TEST_CONFIG_PATH=../application-test.yml\n");
  await assert.rejects(configuration(root, inherited), /local/);
});

test("rechaza una variante del YAML que Spring Boot podría cargar con perfil test", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=./integration/backend/service.jar",
    "BACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml"]);
  await writeFile(join(root, "integration", "backend", "application-test-test.yml"), validYaml);
  await assert.rejects(configuration(root, inherited), /variante de perfil/);
});

test("entorno del backend usa secreto del archivo y excluye overrides heredados", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=../service.jar",
    "BACKEND_TEST_CONFIG_PATH=../application-test.yml"]);
  const config = await configuration(root, inherited);
  const env = backendEnvironment(config, inherited);
  assert.equal(env.BFF_SERVICE_SECRET, "file-synthetic-secret");
  assert.equal(env.TEST_DB_URL, inherited.TEST_DB_URL);
  for (const key of ["DB_URL", "SPRING_DATASOURCE_URL", "JAVA_TOOL_OPTIONS", "BACKEND_JAR_PATH"]) {
    assert.equal(env[key], undefined);
  }
  assert.equal(env.SPRING_PROFILES_ACTIVE, "test");
});

test("preflight exige lectura real, base y rol esperados sin privilegios elevados", () => {
  const config = { database: { database: "integration_test" }, dbUser: "integration_role" };
  const result = { status: 0, stdout: "integration_test|integration_role|t|t\n" };
  assert.doesNotThrow(() => assertReadOnlyPreflightResult(result, config));
  for (const stdout of [
    "COMMIT\n", "integration_test|integration_role|f|t\n",
    "integration_test|integration_role|t|f\n",
    "other_test|integration_role|t|t\n",
  ]) assert.throws(() => assertReadOnlyPreflightResult({ status: 0, stdout }, config), /consulta solo lectura/);
  assert.throws(() => assertReadOnlyPreflightResult({ status: 1, stdout: result.stdout }, config), /solo lectura/);
});

test("vincula sockets propios con pg_stat_activity y rechaza destinos ambiguos", () => {
  const config = { backendPort: 18080, database: { database: "integration_test", port: 5432 },
    dbUser: "integration_role" };
  const sockets = parseEstablishedSockets(
    '0 0 127.0.0.1:42000 127.0.0.1:5432 users:(("java",pid=123,fd=9))\n');
  const rows = parseActivityRows("integration_test|integration_role|127.0.0.1|42000|client backend\n");
  assert.doesNotThrow(() => assertDatasourceEvidence(sockets, rows, config));
  assert.throws(() => assertDatasourceEvidence([], rows, config), /No se observó/);
  assert.throws(() => assertDatasourceEvidence(sockets, [], config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows("other_test|integration_role|127.0.0.1|42000|client backend\n"), config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows("integration_test|other_role|127.0.0.1|42000|client backend\n"), config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows("integration_test|integration_role|127.0.0.1|42001|client backend\n"), config), /vincular/);
  const otherSocket = parseEstablishedSockets(
    '0 0 127.0.0.1:42001 127.0.0.1:5433 users:(("java",pid=123,fd=10))\n');
  assert.throws(() => assertDatasourceEvidence([...sockets, ...otherSocket], rows, config), /ajena/);
  assert.throws(() => parseActivityRows("incompleta\n"), /interpretar/);
});

test("puerto ocupado causa aborto sin detener al servidor ajeno", async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await assert.rejects(assertPortFree(server.address().port), /ocupado/); }
  finally { await new Promise((done) => server.close(done)); }
});

test("teardown termina solo el grupo de proceso propio", async () => {
  const child = startOwned(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { env: { PATH: process.env.PATH } });
  try { assert.ok(child.pid); }
  finally { await stopOwned(child); }
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  const unrelated = spawnSync(process.execPath, ["-e", "process.stdout.write('ok')"], { encoding: "utf8" });
  assert.equal(unrelated.stdout, "ok");
});

test("fallo de arranque se detecta sin usar servidor preexistente", async () => {
  const child = startOwned("/bin/no-existe-un-servicio", [], { env: { PATH: process.env.PATH } });
  try {
    await assert.rejects(waitReady("http://127.0.0.1:9/", child, 1000), /terminó antes/);
  } finally { await stopOwned(child); }
});

test("readiness confirma que el listener pertenece al proceso iniciado", async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  const child = startOwned(process.execPath, ["-e",
    "require('node:http').createServer((_, res) => res.end('ready')).listen(Number(process.env.PORT), '127.0.0.1')"],
    { env: { PATH: process.env.PATH, PORT: String(port) } });
  const other = startOwned(process.execPath, ["-e", "setInterval(() => {}, 1000)"],
    { env: { PATH: process.env.PATH } });
  try {
    await waitReady(`http://127.0.0.1:${port}/`, child, 3000);
    await assertOwnedPort(port, child);
    await assert.rejects(assertOwnedPort(port, other), /otro proceso/);
  } finally { await stopOwned(child); await stopOwned(other); }
});
