import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import IdentificationReporter, { safeDiagnostic } from "./reporter.ts";
import { attemptSessionCleanup } from "./session-cleanup.ts";

test("el reportero informa ubicación sin exponer mensaje, stack ni datos sintéticos", (t) => {
  const output = [];
  t.mock.method(console, "log", (line) => output.push(String(line)));
  const reporter = new IdentificationReporter();
  const sensitive = "persona@example.com ca_sesion=opaque-test X-Service-Token=secret-test sesionId=opaque-test";
  const error = {
    message: sensitive,
    stack: `${sensitive}\n    at /tmp/private/sesiones-ui.spec.ts:207:3`,
    location: { file: "/tmp/private/sesiones-ui.spec.ts", line: 207, column: 3 },
  };
  reporter.onTestEnd({ title: "caso sintético" }, { status: "failed", errors: [error],
    stdout: ["Cierre de contingencia: DELETE 204 y cookie eliminada; persistencia no verificada.\n", sensitive], });
  reporter.onError({ message: sensitive, stack: sensitive });
  assert.deepEqual(output, [
    "failed: caso sintético",
    "Cierre de contingencia: DELETE 204 y cookie eliminada; persistencia no verificada.",
    "Fallo E2E en sesiones-ui.spec.ts:207.",
    "Fallo E2E sin ubicación segura.",
  ]);
  assert.equal(output.join(" ").includes(sensitive), false);
  assert.equal(safeDiagnostic({ stack: `${sensitive}\n at /tmp/sesiones-ui.spec.ts:209:4` }),
    "Fallo E2E en sesiones-ui.spec.ts:209.");
});

test("antes del POST de inicio no se intenta cerrar", async () => {
  const never = async () => { throw new Error("No debe llamarse"); };
  assert.equal(await attemptSessionCleanup({ loginDispatched: false, logoutConfirmed: false,
    hasCookie: never, beforeMutation: never, deleteSession: never }), "not-needed");
});

test("201 con cookie y fallo posterior permite un único cierre controlado", async () => {
  let cookie = true;
  let preflights = 0;
  let deletes = 0;
  const outcome = await attemptSessionCleanup({ loginDispatched: true, logoutConfirmed: false,
    hasCookie: async () => cookie,
    beforeMutation: async () => { preflights++; },
    deleteSession: async () => { deletes++; cookie = false; return 204; },
  });
  assert.equal(outcome, "http-204-cookie-cleared");
  assert.equal(preflights, 1);
  assert.equal(deletes, 1);
});

test("persistencia con respuesta perdida y sin cookie no tiene cierre seguro", async () => {
  let calls = 0;
  const forbidden = async () => { calls++; throw new Error("No debe llamarse"); };
  assert.equal(await attemptSessionCleanup({ loginDispatched: true, logoutConfirmed: false,
    hasCookie: async () => false, beforeMutation: forbidden, deleteSession: forbidden }),
  "unrecoverable-no-cookie");
  assert.equal(calls, 0);
});

test("DELETE fallido, preflight fallido o contexto perdido dejan cierre no confirmado", async () => {
  for (const actions of [
    { hasCookie: async () => true, beforeMutation: async () => {}, deleteSession: async () => 502 },
    { hasCookie: async () => true, beforeMutation: async () => { throw new Error("preflight"); },
      deleteSession: async () => { throw new Error("No debe llamarse"); } },
    { hasCookie: async () => { throw new Error("contexto cerrado"); }, beforeMutation: async () => {},
      deleteSession: async () => 204 },
  ]) {
    assert.equal(await attemptSessionCleanup({ loginDispatched: true, logoutConfirmed: false,
      ...actions }), "unconfirmed");
  }
});

test("la terminación inmediata del proceso impide ejecutar finally", () => {
  const child = spawnSync(process.execPath, ["-e",
    "try { process.exit(7) } finally { process.stdout.write('cleanup') }"],
  { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
  assert.equal(child.status, 7);
  assert.equal(child.stdout, "");
});
