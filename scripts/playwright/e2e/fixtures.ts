import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test as base, expect } from "playwright/test";

export const fixtureEmail = ["Persona", "example.com"].join("@");
export const fixtureServiceSecret = "synthetic-e2e-service-token";
export const identificationPath = "/api/usuarios/identificacion";
const repository = path.resolve(__dirname, "../../..");

type Mode = number | "defer" | "disconnect" | "timeout";
type ReceivedRequest = {
  method: string | undefined;
  path: string | undefined;
  validContract: boolean;
  forwardedCredentials: boolean;
  validServiceToken: boolean;
};

export type Scenario = {
  mode: Mode;
  received: ReceivedRequest[];
  pending?: ServerResponse;
  submissions: number;
  directBackendCalls: number;
  browserSentServiceToken: boolean;
};

type Upstream = { server: Server; origin: string; scenario?: Scenario };
type App = { origin: string };

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No se asignó el puerto de prueba");
  return address.port;
}

async function stopApp(app: ChildProcess) {
  if (app.exitCode !== null || app.signalCode !== null) return;
  const stopped = once(app, "exit");
  app.kill("SIGTERM");
  const deadline = setTimeout(() => app.kill("SIGKILL"), 5_000);
  try {
    await stopped;
  } finally {
    clearTimeout(deadline);
  }
}

export const test = base.extend<{ scenario: Scenario }, { upstream: Upstream; app: App }>({
  upstream: [async ({}, provide) => {
    const upstream: Upstream = {
      origin: "",
      server: createServer(async (request, response) => {
        const scenario = upstream.scenario;
        if (!scenario) {
          response.writeHead(503).end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const tokenHeaders = request.rawHeaders.filter((name, index) =>
            index % 2 === 0 && name.toLowerCase() === "x-service-token");
          // Guardar solo comprobaciones, nunca el correo ni el cuerpo recibido.
          scenario.received.push({
            method: request.method,
            path: request.url,
            validContract: Object.keys(body).length === 1 && body.email === fixtureEmail &&
              request.headers["content-type"] === "application/json",
            forwardedCredentials: ["cookie", "authorization", "x-forwarded-for"].some(
              (header) => request.headers[header] !== undefined,
            ),
            validServiceToken: tokenHeaders.length === 1 &&
              request.headers["x-service-token"] === fixtureServiceSecret,
          });
          if (scenario.mode === "timeout") return;
          if (scenario.mode === "disconnect") {
            request.socket.destroy();
            return;
          }
          if (scenario.mode === "defer") {
            scenario.pending = response;
            return;
          }
          response.writeHead(scenario.mode, {
            "Content-Type": "application/json",
            "Retry-After": "60",
            "Set-Cookie": "identity=synthetic-secret",
            "X-User-Id": "synthetic-secret",
            "X-Service-Token": fixtureServiceSecret,
          });
          response.end(scenario.mode === 204 ? undefined : '{"usuarioId":"synthetic-secret"}');
        } catch {
          response.writeHead(400).end();
        }
      }),
    };
    try {
      upstream.origin = `http://127.0.0.1:${await listen(upstream.server)}`;
      await provide(upstream);
    } finally {
      upstream.server.closeAllConnections();
      await new Promise<void>((resolve) => upstream.server.close(() => resolve()));
    }
  }, { scope: "worker" }],

  app: [async ({ upstream }, provide) => {
    const directory = await mkdtemp(path.join(tmpdir(), "conciencia-identificacion-e2e-"));
    let app: ChildProcess | undefined;
    try {
      // Copiar solo código/configuración. Nunca se buscan o copian archivos .env*.
      for (const entry of ["src", "package.json", "next.config.ts", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs"]) {
        await cp(path.join(repository, entry), path.join(directory, entry), { recursive: true });
      }
      for (const entry of ["node_modules", "public"]) {
        await symlink(path.join(repository, entry), path.join(directory, entry), "dir");
      }
      const reservation = createServer();
      const port = await listen(reservation);
      await new Promise<void>((resolve) => reservation.close(() => resolve()));
      const origin = `http://127.0.0.1:${port}`;
      // Webpack permite reutilizar node_modules por symlink desde el temporal.
      // Se compila el código actual, sin depender de un build previo ni sus hooks.
      app = spawn(process.execPath, [
        path.join(repository, "node_modules/next/dist/bin/next"),
        "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port),
      ], {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "development",
          BACKEND_URL: upstream.origin,
          BFF_SERVICE_SECRET: fixtureServiceSecret,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: "ignore",
      });
      await expect.poll(async () => {
        if (app?.exitCode !== null) throw new Error("Next.js terminó antes de estar disponible");
        try {
          const response = await fetch(origin, { signal: AbortSignal.timeout(5_000) });
          await response.body?.cancel();
          return response.ok;
        } catch {
          return false;
        }
      }, { timeout: 45_000, message: "Next.js no inició en el entorno aislado" }).toBe(true);
      // Compilar también el handler, sin enviar un POST ni alcanzar el upstream.
      const ready = await fetch(origin + identificationPath, { signal: AbortSignal.timeout(30_000) });
      await ready.body?.cancel();
      expect(ready.status).toBe(405);
      await provide({ origin });
    } finally {
      if (app) await stopApp(app);
      await rm(directory, { recursive: true, force: true });
    }
  }, { scope: "worker", timeout: 60_000 }],

  baseURL: async ({ app }, provide) => {
    await provide(app.origin);
  },

  scenario: async ({ upstream }, provide) => {
    const scenario: Scenario = {
      mode: 204, received: [], submissions: 0, directBackendCalls: 0, browserSentServiceToken: false,
    };
    upstream.scenario = scenario;
    try {
      await provide(scenario);
    } finally {
      // Cerrar conexiones retenidas por timeout antes del siguiente caso.
      upstream.server.closeAllConnections();
      upstream.scenario = undefined;
    }
  },

  page: async ({ page, app, upstream, scenario }, provide) => {
    page.on("request", (request) => {
      if (request.url() === app.origin + identificationPath && request.method() === "POST") {
        scenario.submissions += 1;
        if (request.headers()["x-service-token"] !== undefined) {
          scenario.browserSentServiceToken = true;
        }
      }
    });
    await page.context().route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === upstream.origin) scenario.directBackendCalls += 1;
      if (url.origin !== app.origin) return route.abort();
      // El tracking ya existente se aísla para no escribir en Redis.
      if (url.pathname.startsWith("/api/visits")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.continue();
    });
    await provide(page);
    expect(scenario.directBackendCalls).toBe(0);
    expect(scenario.browserSentServiceToken).toBe(false);
    for (const request of scenario.received) {
      expect(request.method).toBe("POST");
      expect(request.path).toBe(identificationPath);
      expect(request.validContract).toBe(true);
      expect(request.forwardedCredentials).toBe(false);
      expect(request.validServiceToken).toBe(true);
    }
  },
});

export { expect };
