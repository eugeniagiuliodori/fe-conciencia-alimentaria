import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Compatibilidad con el comando manual anterior: la suite vive en Playwright Test.
const repository = fileURLToPath(new URL("../../", import.meta.url));
const runner = spawn(process.execPath, [
  path.join(repository, "node_modules/playwright/cli.js"),
  "test",
  ...process.argv.slice(2),
], { cwd: repository, stdio: "inherit" });

runner.on("exit", (code) => { process.exitCode = code ?? 1; });
runner.on("error", () => {
  console.error("No se pudo iniciar Playwright Test.");
  process.exitCode = 1;
});
