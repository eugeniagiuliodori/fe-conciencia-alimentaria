// Module._resolveFilename no garantiza redirigir los imports ESM.
// Este reemplazo se registra solo desde sesiones.test.mjs.
export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: new URL("./server-only-test-stub.cjs", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
