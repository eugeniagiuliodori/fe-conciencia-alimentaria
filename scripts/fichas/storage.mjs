import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { assertNoSecret, fail, ROOT } from "./core.mjs";

const PUBLIC = resolve(ROOT, "public");
const inside = (parent, child) => {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
      path !== ".." &&
      !isAbsolute(path))
  );
};

export async function privateDirectory(path) {
  const absolute = resolve(path);
  const publicReal = await realpath(PUBLIC).catch(() => PUBLIC);
  if (inside(PUBLIC, absolute) || inside(publicReal, absolute))
    fail(
      "PERSISTENCIA",
      "SALIDA_PUBLICA_RECHAZADA",
      "Las fichas privadas no se pueden escribir dentro de public/.",
      false,
    );
  // Resolve the nearest existing ancestor before creating anything.
  let ancestor = absolute;
  const suffix = [];
  while (true) {
    try {
      const actual = resolve(await realpath(ancestor), ...suffix);
      if (inside(PUBLIC, actual) || inside(publicReal, actual))
        fail(
          "PERSISTENCIA",
          "SALIDA_PUBLICA_RECHAZADA",
          "La salida apunta a public/ mediante un enlace simbólico.",
          false,
        );
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      suffix.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  const actual = await realpath(absolute);
  if (inside(publicReal, actual))
    fail(
      "PERSISTENCIA",
      "SALIDA_PUBLICA_RECHAZADA",
      "La salida resuelta pertenece a public/.",
      false,
    );
  return actual;
}

export async function outputPath(identity, directory = "data/fichas") {
  const root = await privateDirectory(resolve(ROOT, directory));
  const month = await privateDirectory(join(root, identity.month));
  return join(month, `ficha_${identity.date}_${identity.key}.json`);
}

export async function readExisting(path) {
  try {
    if (!(await lstat(path)).isFile())
      fail(
        "PERSISTENCIA",
        "ARCHIVO_EXISTENTE_INVALIDO",
        "La ruta de ficha existente no es un archivo regular. No se reemplazó.",
        false,
      );
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value === null)
      fail(
        "VALIDACION_JSON",
        "ARCHIVO_EXISTENTE_INVALIDO",
        "El archivo existente contiene null, no una ficha. Se conserva para inspección.",
        false,
      );
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError)
      fail(
        "VALIDACION_JSON",
        "ARCHIVO_EXISTENTE_INVALIDO",
        "La ficha existente tiene JSON inválido. Se conserva para inspección; el diagnóstico se guarda por separado.",
        false,
      );
    throw error;
  }
}

export async function atomicWrite(
  path,
  value,
  { secret, renameFile = rename } = {},
) {
  assertNoSecret(value, secret);
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`, {
    secret,
    renameFile,
  });
}

async function atomicWriteText(path, text, { secret, renameFile = rename }) {
  assertNoSecret(text, secret);
  assertNoSecret(path, secret);
  await privateDirectory(dirname(path));
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await renameFile(temporary, path);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}

export async function writeCoverageText(
  fichaPath,
  text,
  { timestamp = new Date().toISOString(), secret, linkFile = link } = {},
) {
  let milliseconds = new Date(timestamp).getTime();
  const nextPath = () => join(
    dirname(fichaPath),
    `${new Date(milliseconds).toISOString().replace(/Z$/, "").replace(/[T:.]/g, "-")}.txt`,
  );
  let path = nextPath();
  await atomicWriteText(path, text, {
    secret,
    renameFile: async (temporary) => {
      // Publish the complete file exclusively: concurrent attempts cannot overwrite it.
      // Increment milliseconds on collision, preserving the timestamp-only name.
      while (true) {
        assertNoSecret(path, secret);
        try {
          await linkFile(temporary, path);
          return;
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          milliseconds += 1;
          path = nextPath();
        }
      }
    },
  });
  return path;
}

export function historyPath(path, record, kind = "revision") {
  return join(
    dirname(path),
    "historial",
    record.idempotency_key,
    `${kind}_${record.revision}_intento_${record.intentos}_${randomUUID()}.json`,
  );
}

export async function acquireLock(path) {
  const lockPath = `${path}.lock`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      fail(
        "PERSISTENCIA",
        "EJECUCION_EN_CURSO",
        "Ya existe un bloqueo para esta identidad. Esperá la ejecución activa; si se interrumpió, verificá su PID antes de retirar manualmente el archivo .lock.",
        false,
      );
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({
        pid: process.pid,
        iniciado_en: new Date().toISOString(),
      }),
    );
  } catch (error) {
    await handle.close();
    await rm(lockPath, { force: true });
    throw error;
  }
  return async () => {
    await handle.close();
    await rm(lockPath, { force: true });
  };
}
