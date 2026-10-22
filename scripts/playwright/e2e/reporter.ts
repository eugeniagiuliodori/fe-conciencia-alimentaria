import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from "playwright/types/testReporter";

const safeNotices = new Set([
  "Inicio enviado sin cookie recuperable: no existe cierre seguro por la API actual.",
  "No se confirmó el cierre de contingencia de la sesión sintética.",
  "Cierre de contingencia: DELETE 204 y cookie eliminada; persistencia no verificada.",
]);

// El mensaje y el stack pueden contener cuerpos, cookies o datos ingresados.
// Informar solo un nombre de spec y una línea verificables.
export function safeDiagnostic(error: TestError): string {
  const file = error.location?.file ? path.basename(error.location.file) : undefined;
  const line = error.location?.line;
  if (file && /^[a-z0-9-]+\.spec\.ts$/.test(file) &&
      Number.isSafeInteger(line) && line! > 0) {
    return `Fallo E2E en ${file}:${line}.`;
  }
  const frame = /(?:^|[\s/(])([a-z0-9-]+\.spec\.ts):(\d+):\d+/m.exec(error.stack ?? "");
  return frame ? `Fallo E2E en ${frame[1]}:${frame[2]}.` : "Fallo E2E sin ubicación segura.";
}

export default class IdentificationReporter implements Reporter {
  private total = 0;
  private completed = 0;
  private passed = 0;

  onBegin(_config: FullConfig, suite: Suite) {
    this.total = suite.allTests().length;
    console.log(`E2E: ${this.total} casos seleccionados.`);
    if (process.argv.includes("--list")) {
      for (const test of suite.allTests()) console.log(test.title);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.completed += 1;
    if (result.status === "passed") this.passed += 1;
    console.log(`${result.status}: ${test.title}`);
    for (const chunk of result.stdout) {
      const notice = String(chunk).trim();
      if (safeNotices.has(notice)) console.log(notice);
    }
    for (const error of result.errors) {
      console.log(safeDiagnostic(error));
    }
  }

  onError(error: TestError) {
    console.log(safeDiagnostic(error));
  }

  onEnd(result: FullResult) {
    console.log(`E2E: ${result.status}; ejecutados: ${this.completed}/${this.total}; aprobados: ${this.passed}.`);
  }
}
