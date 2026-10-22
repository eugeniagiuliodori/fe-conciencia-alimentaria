import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { assertDatasourceEvidence, assertNoKnownJarInitializers, assertOwnedPort, assertPortFree, assertReadOnlyPreflightResult,
  assertRealE2EProcessTree,
  backendEnvironment, configuration, frontendEnvironment, parseActivityRows, parseEstablishedSockets,
  observeTestProfile, parseTestDatabase, playwrightEnvironment, readOnlyPreflight, readableIntegrationFile, run,
  selectedIntegrationPhases, sessionCookie, startOwned, stopOwned,
  validateYaml } from "./test-integracion.mjs";
import { waitReady } from "./test-integracion.mjs";

const validYaml = `spring:\n  datasource:\n    url: \${TEST_DB_URL}\n    username: \${TEST_DB_USERNAME}\n    password: \${TEST_DB_PASSWORD}\n  jpa:\n    hibernate:\n      ddl-auto: none\n`;
const extendedYaml = `# Configuración externa de prueba\nspring:\n  datasource:\n    url: \${TEST_DB_URL}\n    username: \${TEST_DB_USERNAME}\n    password: \${TEST_DB_PASSWORD}\n    hikari:\n      connection-timeout: 30000\n  jpa:\n    hibernate:\n      ddl-auto: none\n    show-sql: false\n  sql:\n    init:\n      mode: never\nlogging:\n  level:\n    com.zaxxer.hikari: INFO\n    org.hibernate.SQL: DEBUG\n    org.hibernate.orm.jdbc.bind: TRACE\n`;
const testDatabaseName = "conciencia_alimentaria_test";
const expectedComment = "fixture: isolated test database";
const inherited = { PATH: process.env.PATH, BACKEND_JAR_PATH: "/ignored.jar",
  BACKEND_TEST_CONFIG_PATH: "/ignored.yml", BFF_SERVICE_SECRET: "terminal-secret",
  TEST_DB_URL: `jdbc:postgresql://127.0.0.1:5432/${testDatabaseName}`,
  TEST_DB_USERNAME: "conciencia_app_test", TEST_DB_PASSWORD: "synthetic-password",
  TEST_DB_EXPECTED_NAME: testDatabaseName, TEST_DB_EXPECTED_COMMENT: expectedComment,
  DB_URL: "development-db",
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
  assert.deepEqual(parseTestDatabase(`jdbc:postgresql://localhost:5432/${testDatabaseName}`, testDatabaseName),
    { host: "localhost", port: 5432, database: testDatabaseName });
  assert.deepEqual(parseTestDatabase(`jdbc:postgresql://[::1]:5433/${testDatabaseName}`, testDatabaseName),
    { host: "::1", port: 5433, database: testDatabaseName });
  assert.equal(parseTestDatabase(inherited.TEST_DB_URL, inherited.TEST_DB_EXPECTED_NAME).database, testDatabaseName);
});

test("rechaza destinos remotos, opciones JDBC y bases no confirmadas", () => {
  assert.throws(() => parseTestDatabase(`jdbc:postgresql://db.example.com:5432/${testDatabaseName}`, testDatabaseName), /local/);
  assert.throws(() => parseTestDatabase(`jdbc:postgresql://localhost/${testDatabaseName}`, testDatabaseName), /puerto/);
  assert.throws(() => parseTestDatabase(`jdbc:postgresql://localhost:5432/${testDatabaseName}?sslmode=require`, testDatabaseName), /opciones/);
  assert.throws(() => parseTestDatabase(`jdbc:postgresql://user:pass@localhost:5432/${testDatabaseName}`, testDatabaseName), /credenciales/);
  assert.throws(() => parseTestDatabase(inherited.TEST_DB_URL, "other_test"), /no coincide/);
  assert.throws(() => parseTestDatabase("jdbc:postgresql://localhost:5432/other_test", testDatabaseName), /no coincide/);
});

test("configuración exige comentario esperado privado antes del preflight", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=./integration/backend/service.jar",
    "BACKEND_TEST_CONFIG_PATH=./integration/backend/application-test.yml"]);
  for (const expectedCommentValue of [undefined, "", "   "]) {
    await assert.rejects(configuration(root, { ...inherited,
      TEST_DB_EXPECTED_COMMENT: expectedCommentValue }), /Falta TEST_DB_EXPECTED_COMMENT/);
  }
  await assert.rejects(configuration(root, { ...inherited,
    TEST_DB_EXPECTED_NAME: "other_test" }), /conciencia_alimentaria_test/);
  await assert.rejects(configuration(root, { ...inherited,
    TEST_DB_USERNAME: "other_role" }), /TEST_DB_USERNAME/);
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

test("psql, JAR y Playwright usan la misma configuración de BD validada aunque cambie el entorno heredado", async (t) => {
  const { root } = await fixture(t, ["BACKEND_JAR_PATH=../service.jar",
    "BACKEND_TEST_CONFIG_PATH=../application-test.yml"]);
  const config = await configuration(root, inherited);
  const changed = { ...inherited, TEST_DB_URL: "jdbc:postgresql://127.0.0.1:5432/other_test",
    TEST_DB_USERNAME: "other_role", TEST_DB_PASSWORD: "other-password",
    TEST_DB_EXPECTED_COMMENT: "other-comment", BFF_SERVICE_SECRET: "other-secret" };
  const backend = backendEnvironment(config, changed);
  const browser = playwrightEnvironment(config, 123, "http://127.0.0.1:3100", changed);
  const frontend = frontendEnvironment(config, root, changed);
  for (const env of [backend, browser]) {
    assert.equal(env.TEST_DB_URL, config.dbUrl);
    assert.equal(env.TEST_DB_USERNAME, config.dbUser);
    assert.equal(env.TEST_DB_PASSWORD, config.dbPassword);
  }
  assert.equal(browser.TEST_DB_EXPECTED_NAME, config.expectedName);
  assert.equal(browser.TEST_DB_EXPECTED_COMMENT, config.expectedComment);
  assert.equal(frontend.BACKEND_URL, config.backendUrl);
  assert.equal(frontend.BFF_SERVICE_SECRET, config.secret);
  const commentHex = Buffer.from(config.expectedComment, "utf8").toString("hex");
  readOnlyPreflight(config, (_command, _args, options) => {
    assert.equal(options.env.PGHOST, config.database.host);
    assert.equal(options.env.PGPORT, String(config.database.port));
    assert.equal(options.env.PGDATABASE, config.database.database);
    assert.equal(options.env.PGUSER, backend.TEST_DB_USERNAME);
    assert.equal(options.env.PGPASSWORD, backend.TEST_DB_PASSWORD);
    return { status: 0, stdout: `${testDatabaseName}|${config.dbUser}|t|t|f|${commentHex}\n` };
  });
});

test("preflight exige lectura real, base y rol esperados sin privilegios elevados", () => {
  const config = { database: { database: testDatabaseName }, dbUser: "integration_role", expectedComment };
  const commentHex = Buffer.from(expectedComment, "utf8").toString("hex");
  const result = { status: 0, stdout: `${testDatabaseName}|integration_role|t|t|t|${commentHex}\n` };
  assert.doesNotThrow(() => assertReadOnlyPreflightResult(result, config));
  for (const stdout of [
    "COMMIT\n", `${testDatabaseName}|integration_role|f|t|t|${commentHex}\n`,
    `${testDatabaseName}|integration_role|t|f|t|${commentHex}\n`,
    `other_test|integration_role|t|t|t|${commentHex}\n`,
  ]) assert.throws(() => assertReadOnlyPreflightResult({ status: 0, stdout }, config), /consulta solo lectura/);
  assert.doesNotThrow(() => assertReadOnlyPreflightResult({ status: 0,
    stdout: `${testDatabaseName}|integration_role|t|t|f|${commentHex}\n` }, config));
  assert.throws(() => assertReadOnlyPreflightResult({ status: 0,
    stdout: `${testDatabaseName}|other_role|t|t|t|${commentHex}\n` }, config), /consulta solo lectura/);
  assert.throws(() => assertReadOnlyPreflightResult({ status: 1, stdout: result.stdout }, config), /solo lectura/);
});

test("preflight consulta comentario compartido y exige coincidencia literal", () => {
  const config = { database: { host: "127.0.0.1", port: 5432, database: testDatabaseName },
    dbUser: "integration_role", dbPassword: "synthetic-password", expectedComment };
  const row = (comment) => `${testDatabaseName}|integration_role|t|t|t|${comment === null ? "" : Buffer.from(comment, "utf8").toString("hex")}\n`;
  let calls = 0;
  const fakePsql = (command, args, options) => {
    calls++;
    assert.equal(command, "psql");
    assert.match(args.at(-1), /shobj_description\(oid, 'pg_database'\).*FROM pg_database WHERE datname = current_database\(\)/);
    assert.match(args.at(-1), /has_database_privilege\(current_user, oid, 'CONNECT'\)/);
    assert.equal(options.env.PGOPTIONS, "-c default_transaction_read_only=on");
    assert.equal(options.env.PGDATABASE, testDatabaseName);
    return { status: 0, stdout: row(expectedComment) };
  };
  assert.doesNotThrow(() => readOnlyPreflight(config, fakePsql));
  assert.equal(calls, 1);
  for (const comment of [null, "fixture: different comment"]) {
    assert.throws(() => readOnlyPreflight(config, () => ({ status: 0, stdout: row(comment) })), /comentario administrativo/);
  }
  assert.throws(() => readOnlyPreflight(config, () => ({ status: 1, stdout: "" })), /Falló la consulta/);
  for (const absent of [undefined, "", "   "]) {
    assert.throws(() => readOnlyPreflight({ ...config, expectedComment: absent }, () => {
      throw new Error("No se debe consultar PostgreSQL sin comentario esperado");
    }), /Falta TEST_DB_EXPECTED_COMMENT/);
  }
  assert.throws(() => readOnlyPreflight({ ...config, database: { ...config.database, database: "other_test" } },
    () => ({ status: 0, stdout: row(expectedComment) })), /base de prueba/);
});

test("la cookie de inicio real se valida sin registrar su identificador", () => {
  const response = (cookie) => ({ status: 201, body: "", headers: new Headers({ "set-cookie": cookie }) });
  assert.equal(sessionCookie(response("ca_sesion=synthetic-opaque; Path=/; HttpOnly; SameSite=Lax")),
    "ca_sesion=synthetic-opaque");
  for (const cookie of ["ca_sesion=opaque; Path=/; SameSite=Lax",
    "ca_sesion=opaque; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
    "ca_sesion=opaque; Path=/; HttpOnly; SameSite=Strict"]) {
    assert.throws(() => sessionCookie(response(cookie)), /cookie de sesión/);
  }
});

test("Playwright real solo recibe configuración de prueba necesaria", () => {
  const env = playwrightEnvironment({ backendPort: 18080, dbUrl: inherited.TEST_DB_URL,
    dbUser: inherited.TEST_DB_USERNAME, dbPassword: inherited.TEST_DB_PASSWORD,
    expectedName: inherited.TEST_DB_EXPECTED_NAME, expectedComment }, 123, "http://127.0.0.1:3100",
    { ...inherited, HOME: "/tmp/test-home", OWNER_SECRET: "development-owner" });
  assert.equal(env.E2E_REAL_BACKEND_PID, "123");
  assert.equal(env.TEST_DB_EXPECTED_COMMENT, expectedComment);
  assert.equal(env.OWNER_SECRET, undefined);
  assert.equal(env.BFF_SERVICE_SECRET, undefined);
  assert.equal(env.DB_URL, undefined);
});

test("el perfil test se confirma desde el arranque sin emitir el log", () => {
  const child = { stdout: new PassThrough(), stderr: new PassThrough() };
  observeTestProfile(child);
  child.stdout.write('The following 1 profile is active: "prod"\n');
  assert.equal(child.testProfileSeen, false);
  child.stdout.write('The following 1 profile is active: "te');
  child.stdout.write('st"\n');
  assert.equal(child.testProfileSeen, true);
  child.stdout.end();
  child.stderr.end();
});

test("el JAR aborta ante migraciones e inicializadores conocidos", () => {
  const index = (stdout) => (command, args) => {
    assert.equal(command, "unzip");
    assert.deepEqual(args, ["-Z1", "/synthetic.jar"]);
    return { status: 0, stdout };
  };
  assert.doesNotThrow(() => assertNoKnownJarInitializers("/synthetic.jar",
    index("BOOT-INF/classes/com/example/Application.class\nBOOT-INF/lib/spring-web.jar\n")));
  for (const entry of ["BOOT-INF/lib/flyway-core.jar", "BOOT-INF/classes/db/migration/V1.sql",
    "BOOT-INF/classes/schema.sql", "BOOT-INF/classes/com/example/SeedRunner.class"]) {
    assert.throws(() => assertNoKnownJarInitializers("/synthetic.jar", index(`${entry}\n`)), /inicializadores/);
  }
  assert.throws(() => assertNoKnownJarInitializers("/synthetic.jar", () => ({ status: 1, stdout: "" })), /índice/);
});

test("un preflight fallido impide iniciar el JAR y ejecutar POST", async () => {
  const config = { backendPort: 18080, frontendPort: 3100,
    database: { host: "127.0.0.1", port: 5432, database: testDatabaseName },
    dbUser: "integration_role", dbPassword: "synthetic-password", expectedComment };
  let starts = 0;
  const start = () => { starts++; throw new Error("No se debe iniciar el JAR"); };
  const originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = () => { posts++; throw new Error("No se debe enviar HTTP"); };
  try {
    const row = (comment) => `${testDatabaseName}|integration_role|t|t|t|${comment === null ? "" : Buffer.from(comment, "utf8").toString("hex")}\n`;
    const cases = [
      { result: { status: 0, stdout: row(null) }, pattern: /comentario administrativo/ },
      { result: { status: 0, stdout: row("other") }, pattern: /comentario administrativo/ },
      { result: { status: 1, stdout: "" }, pattern: /Falló la consulta/ },
      { result: { status: 0, stdout: row(expectedComment) },
        config: { ...config, expectedComment: "" }, pattern: /TEST_DB_EXPECTED_COMMENT/ },
      { result: { status: 0, stdout: row(expectedComment) },
        config: { ...config, expectedComment: undefined }, pattern: /TEST_DB_EXPECTED_COMMENT/ },
      { result: { status: 0, stdout: `other_test|integration_role|t|t|t|${Buffer.from(expectedComment, "utf8").toString("hex")}\n` },
        pattern: /base de prueba/ },
    ];
    for (const item of cases) {
      await assert.rejects(run("/unused", {
        configure: async () => item.config ?? config, checkPort: async () => {},
        preflight: (configured) => readOnlyPreflight(configured, () => item.result), start,
      }), item.pattern);
    }
    assert.equal(starts, 0);
    assert.equal(posts, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("la selección E2E contiene solo Playwright y se rechazan argumentos imprevistos", () => {
  assert.deepEqual(selectedIntegrationPhases([]), ["http", "e2e", "wrong-secret"]);
  assert.deepEqual(selectedIntegrationPhases(["--solo-e2e"]), ["e2e"]);
  for (const args of [["--solo-e2e", "--otro"], ["--grep", "@real"], ["--solo-http"]]) {
    assert.throws(() => selectedIntegrationPhases(args), /Selección de integración/);
  }
});

test("el modo E2E falla cerrado antes de iniciar servicios si falla su preflight", async () => {
  let starts = 0;
  let requests = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { requests++; throw new Error("No debe enviarse HTTP"); };
  try {
    await assert.rejects(run("/unused", {
      phases: selectedIntegrationPhases(["--solo-e2e"]),
      configure: async () => ({ backendPort: 18080, frontendPort: 3100 }),
      checkPort: async () => {},
      preflight: () => { throw new Error("preflight rechazado"); },
      start: () => { starts++; throw new Error("No debe iniciarse el JAR"); },
    }), /preflight rechazado/);
    assert.equal(starts, 0);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test("vincula sockets propios con pg_stat_activity y rechaza destinos ambiguos", () => {
  const config = { backendPort: 18080, database: { database: testDatabaseName, port: 5432 },
    dbUser: "integration_role" };
  const sockets = parseEstablishedSockets(
    '0 0 127.0.0.1:42000 127.0.0.1:5432 users:(("java",pid=123,fd=9))\n');
  const rows = parseActivityRows(`${testDatabaseName}|integration_role|127.0.0.1|42000|client backend\n`);
  assert.doesNotThrow(() => assertDatasourceEvidence(sockets, rows, config));
  assert.throws(() => assertDatasourceEvidence([], rows, config), /No se observó/);
  assert.throws(() => assertDatasourceEvidence(sockets, [], config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows("other_test|integration_role|127.0.0.1|42000|client backend\n"), config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows(`${testDatabaseName}|other_role|127.0.0.1|42000|client backend\n`), config), /vincular/);
  assert.throws(() => assertDatasourceEvidence(sockets,
    parseActivityRows(`${testDatabaseName}|integration_role|127.0.0.1|42001|client backend\n`), config), /vincular/);
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
  try {
    assert.ok(child.pid);
    await assert.doesNotReject(assertRealE2EProcessTree(child.pid, process.pid, process.pid));
    await assert.rejects(assertRealE2EProcessTree(child.pid, 1, process.pid), /mismo orquestador/);
  }
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
