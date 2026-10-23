import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Solo node:test (Node 24 del repositorio). No carga archivos .env ni servicios.
export function installRateLimitTestModules({ admitRequests = false } = {}) {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return nextResolve(new URL("./server-only-test-stub.cjs", import.meta.url).href, context);
      }
      if (admitRequests && specifier === "@/features/rate-limiting/guard") {
        return nextResolve(new URL("./rate-limit-admitted-stub.mjs", import.meta.url).href, context);
      }
      if (specifier === "next/server") return nextResolve("next/server.js", context);
      if (specifier.startsWith("@/")) {
        return nextResolve(new URL(`../../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
      }
      if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
        const target = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(target)) return nextResolve(target.href, context);
      }
      return nextResolve(specifier, context);
    },
  });
}
