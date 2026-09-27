import { Redis } from "@upstash/redis";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VISITS_COUNT_KEY = "visits:count";

const REPORT_PATH =
  "reports/conciencia-alimentaria-visitas.md";

const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL;

const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error(
    "Upstash Redis environment variables are not configured",
  );
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

async function getVisitsCount() {
  const value =
    await redis.get(VISITS_COUNT_KEY);

  /*
   * Si todavía nunca hubo una visita contabilizada,
   * visits:count puede no existir.
   */
  if (value === null) {
    return 0;
  }

  const count = Number(value);

  if (
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw new Error(
      "Redis returned an invalid visits count",
    );
  }

  return count;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(
    "es-AR",
    {
      timeZone:
        "America/Argentina/Cordoba",
      dateStyle: "long",
      timeStyle: "medium",
    },
  ).format(date);
}

function createReport({
  count,
  generatedAt,
}) {
  return `# Conciencia Alimentaria — Informe de visitas

## Total estimado de visitas

**${count}**

## Información del informe

- **Generado:** ${generatedAt}
- **Fuente:** contador \`${VISITS_COUNT_KEY}\` almacenado en Redis.
- **Tipo de dato:** total acumulado estimado de visitas.

> El valor representa una estimación según la heurística de conteo implementada en Conciencia Alimentaria. No debe interpretarse como un conteo exacto de personas únicas.
`;
}

async function main() {
  const count =
    await getVisitsCount();

  const generatedAt =
    formatDate(new Date());

  const report =
    createReport({
      count,
      generatedAt,
    });

  await mkdir(
    dirname(REPORT_PATH),
    {
      recursive: true,
    },
  );

  await writeFile(
    REPORT_PATH,
    report,
    "utf8",
  );

  console.log(
    `Informe generado: ${REPORT_PATH}`,
  );

  console.log(
    `Total estimado de visitas: ${count}`,
  );
}

main().catch((error) => {
  console.error(
    "No se pudo generar el informe de visitas:",
    error,
  );

  process.exitCode = 1;
});