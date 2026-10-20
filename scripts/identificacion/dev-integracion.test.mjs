import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { integrationEnvironment } from "./dev-integracion.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const launcher = join(repository, "scripts/identificacion/dev-integracion.mjs");
const localUrl = "http://127.0.0.1:18080";
const testSecret = "synthetic-integration-token";
const blockedNames = [
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

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "conciencia-integracion-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeConfig(directory, content) {
  await writeFile(join(directory, ".env.integracion.local"), content);
}

test("el archivo explícito prevalece sobre terminal y .env.local al cargar Next.js", async (t) => {
  const directory = await fixture(t);
  await writeConfig(directory, `BACKEND_URL=${localUrl}\nBFF_SERVICE_SECRET=${testSecret}\n`);
  await writeFile(join(directory, ".env.local"), "BACKEND_URL=https://dev.example.com\nBFF_SERVICE_SECRET=dev-only\n");
  const env = integrationEnvironment(directory, {
    PATH: process.env.PATH,
    BACKEND_URL: "https://parent.example.com",
    BFF_SERVICE_SECRET: "parent-only",
    NODE_ENV: "production",
  });
  assert.equal(env.BACKEND_URL, localUrl);
  assert.equal(env.BFF_SERVICE_SECRET, testSecret);
  assert.equal(env.NODE_ENV, "development");
  const modulePath = requireResolveNextEnv();
  const result = spawnSync(process.execPath, ["-e", `
    require(${JSON.stringify(modulePath)}).loadEnvConfig(process.cwd(), true);
    process.stdout.write(JSON.stringify({
      url: process.env.BACKEND_URL === ${JSON.stringify(localUrl)},
      secret: process.env.BFF_SERVICE_SECRET === ${JSON.stringify(testSecret)}
    }));
  `], { cwd: directory, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { url: true, secret: true });
});

test("las variables propias bloqueadas no reaparecen desde la terminal ni archivos .env*", async (t) => {
  const directory = await fixture(t);
  await writeConfig(directory, [
    `BACKEND_URL=${localUrl}`,
    `BFF_SERVICE_SECRET=${testSecret}`,
    ...blockedNames.map((name) => `${name}=synthetic-integration-${name}`),
    "QSTASH_DEV=true",
    "",
  ].join("\n"));

  const inherited = {
    PATH: process.env.PATH,
    PORT: "41337",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    BACKEND_URL: "https://parent.example.com",
    BFF_SERVICE_SECRET: "synthetic-parent-token",
    ...Object.fromEntries(blockedNames.map((name) => [name, `synthetic-parent-${name}`])),
    QSTASH_DEV: "true",
  };
  const env = integrationEnvironment(directory, inherited);
  assert.equal(env.PORT, inherited.PORT);
  assert.equal(env.NEXT_TELEMETRY_DISABLED, inherited.NEXT_TELEMETRY_DISABLED);
  assert.ok(blockedNames.every((name) => env[name] === ""));
  assert.equal(env.QSTASH_DEV, "false");

  for (const name of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    await writeFile(join(directory, name), [
      "BACKEND_URL=https://development.example.com",
      "BFF_SERVICE_SECRET=synthetic-development-token",
      ...blockedNames.map((key) => `${key}=synthetic-development-${key}`),
      "QSTASH_DEV=true",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, ["-e", `
      const { loadEnvConfig } = require(${JSON.stringify(requireResolveNextEnv())});
      loadEnvConfig(process.cwd(), true);
      loadEnvConfig(process.cwd(), true, console, true);
      process.stdout.write(JSON.stringify({
        blocked: ${JSON.stringify(blockedNames)}.every((name) => process.env[name] === ""),
        qstashDev: process.env.QSTASH_DEV === "false",
        backend: process.env.BACKEND_URL === ${JSON.stringify(localUrl)},
        serviceSecret: process.env.BFF_SERVICE_SECRET === ${JSON.stringify(testSecret)},
        port: process.env.PORT === "41337",
        nodeEnv: process.env.NODE_ENV === "development"
      }));
    `], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), {
      blocked: true,
      qstashDev: true,
      backend: true,
      serviceSecret: true,
      port: true,
      nodeEnv: true,
    }, name);
    await rm(join(directory, name));
  }
});

function requireResolveNextEnv() {
  return join(repository, "node_modules/@next/env");
}

test("archivo ausente o variables ausentes no recuperan valores heredados", async (t) => {
  const directory = await fixture(t);
  const inherited = { BACKEND_URL: localUrl, BFF_SERVICE_SECRET: testSecret };
  assert.throws(() => integrationEnvironment(directory, inherited), /No se pudo leer/);
  const missingFile = spawnSync(process.execPath, [launcher], {
    cwd: directory,
    env: { ...process.env, ...inherited },
    encoding: "utf8",
  });
  assert.equal(missingFile.status, 1);
  assert.match(missingFile.stderr, /No se pudo leer/);
  assert.ok(!missingFile.stderr.includes(testSecret));
  await mkdir(join(directory, ".env.integracion.local"));
  assert.throws(() => integrationEnvironment(directory, inherited), /No se pudo leer/);
  await rm(join(directory, ".env.integracion.local"), { recursive: true });
  for (const content of [
    `BFF_SERVICE_SECRET=${testSecret}\n`,
    `BACKEND_URL=${localUrl}\n`,
    `BACKEND_URL=${localUrl}\nBFF_SERVICE_SECRET=   \n`,
  ]) {
    await writeConfig(directory, content);
    assert.throws(() => integrationEnvironment(directory, inherited), /debe definir/);
  }
});

test("rechaza destinos no locales y no imprime valores sensibles", async (t) => {
  const directory = await fixture(t);
  for (const url of ["https://backend.example.com", "http://localhost.evil.test:8080", "http://localhost:8080/api", "http://localhost:8080?", "http://localhost:8080#", "http://user:pass@localhost:8080"]) {
    await writeConfig(directory, `BACKEND_URL="${url}"\nBFF_SERVICE_SECRET=${testSecret}\n`);
    const result = spawnSync(process.execPath, [launcher], {
      cwd: directory,
      env: { ...process.env, BFF_SERVICE_SECRET: "parent-only" },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BACKEND_URL debe ser/);
    assert.ok(!result.stderr.includes(url));
    assert.ok(!result.stderr.includes(testSecret));
    assert.ok(!result.stderr.includes("parent-only"));
  }
});

test("arranca Next.js localmente y se detiene con SIGTERM", { timeout: 60_000 }, async (t) => {
  const directory = await fixture(t);
  await writeConfig(directory, `BACKEND_URL=${localUrl}\nBFF_SERVICE_SECRET=${testSecret}\n`);
  await writeFile(join(directory, ".env.local"), [
    "BACKEND_URL=https://dev.example.com",
    "BFF_SERVICE_SECRET=dev-only",
    ...blockedNames.map((name) => `${name}=synthetic-development-${name}`),
    "QSTASH_DEV=true",
    "",
  ].join("\n"));
  await writeFile(join(directory, "package.json"), '{"private":true}');
  await mkdir(join(directory, "src/app"), { recursive: true });
  await mkdir(join(directory, "src/app/api/integration-env"), { recursive: true });
  await writeFile(join(directory, "src/app/layout.tsx"), "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");
  await writeFile(join(directory, "src/app/page.tsx"), "export default function Page() { return <main>Prueba local</main>; }");
  await writeFile(join(directory, "src/app/api/integration-env/route.ts"), `
    export function GET() {
      return Response.json({
        blocked: ${JSON.stringify(blockedNames)}.every((name) => process.env[name] === ""),
        qstashDev: process.env.QSTASH_DEV === "false",
        backend: process.env.BACKEND_URL === ${JSON.stringify(localUrl)},
        serviceSecret: process.env.BFF_SERVICE_SECRET?.startsWith("synthetic-integration-") === true
      });
    }
  `);
  await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "dir");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));

  const child = spawn(process.execPath, [launcher], {
    cwd: directory,
    env: {
      ...process.env,
      ...Object.fromEntries(blockedNames.map((name) => [name, `synthetic-parent-${name}`])),
      PORT: String(port),
      BACKEND_URL: "https://parent.example.com",
      BFF_SERVICE_SECRET: "parent-only",
      QSTASH_DEV: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("Next.js no inició a tiempo")), 45_000);
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        output += chunk.toString();
        if (/Ready in/.test(output)) {
          clearTimeout(timer);
          resolveReady();
        }
      });
    }
    child.on("exit", () => {
      clearTimeout(timer);
      rejectReady(new Error("Next.js terminó antes de iniciar"));
    });
  });
  try {
    await ready;
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Prueba local/);
    const configResponse = await fetch(`http://127.0.0.1:${port}/api/integration-env`, {
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(configResponse.status, 200);
    assert.deepEqual(await configResponse.json(), {
      blocked: true,
      qstashDev: true,
      backend: true,
      serviceSecret: true,
    });
    assert.ok(!output.includes(testSecret));
    assert.ok(!output.includes("parent-only"));
    assert.ok(!output.includes(localUrl));
    for (const entry of await readdir(join(directory, ".next"), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const contents = await readFile(join(entry.parentPath, entry.name));
      assert.ok(!contents.includes(testSecret), `El artefacto ${entry.name} no debe contener el token`);
    }
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
});
