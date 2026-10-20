import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from "playwright/types/testReporter";

// Los fallos de fill/toHaveValue pueden incluir el dato ingresado. El reporte
// se limita a consola, sin adjuntos, snapshots, código fuente ni cuerpos HTTP.
function safeMessage(message: string) {
  return message.replace(/[^\s<>"'`]+@[^\s<>"'`]+/g, "[correo omitido]");
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
    for (const error of result.errors) {
      console.error(safeMessage(error.message ?? "Error de ejecución sin mensaje"));
    }
  }

  onError(error: TestError) {
    console.error(safeMessage(error.message ?? "Error de ejecución sin mensaje"));
  }

  onEnd(result: FullResult) {
    console.log(`E2E: ${result.status}; ejecutados: ${this.completed}/${this.total}; aprobados: ${this.passed}.`);
  }
}
