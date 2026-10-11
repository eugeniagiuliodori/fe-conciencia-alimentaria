import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  process.cwd(),
  "data/raw/negocios/negocios-naturistas-argentina-source.json",
);

const OUTPUT_DIR = path.resolve(
  process.cwd(),
  "data/normalized/negocios",
);

const OUTPUT_PATH = path.join(
  OUTPUT_DIR,
  "negocios-naturistas-argentina.json",
);

type EstadoOrganicosRaw =
  | "TODOS"
  | "ALGUNOS"
  | "NINGUNO"
  | "NO_VERIFICADO";

type EstadoOrganicosNormalizado =
  | "todos"
  | "algunos"
  | "ninguno"
  | "no_verificado";

type TipoUbicacion = "fisica" | "online" | "mixta";

type TipoContacto =
  | "telefono"
  | "whatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "otro";

type ModalidadVenta =
  | "presencial"
  | "online"
  | "envios"
  | "retiro_en_local";

type FuenteRaw = {
  tipo: string;
  url: string;
};

type ProductoRaw = {
  nombre: string;
  categoria?: string | null;
};

type ContactoRaw = {
  tipo: TipoContacto;
  valor: string;
  ubicacionRef?: string | null;
};

type MapaRaw = {
  latitud: number | null;
  longitud: number | null;
  urlMapaNegocio: string | null;
  proveedorMapa: string;
};

type UbicacionRaw = {
  tipo: TipoUbicacion;
  nombreSucursal: string | null;
  direccionFisica: string | null;
  provincia: string | null;
  ciudad: string | null;
  codigoPostal: string | null;
  imagenesNegocioFisico: string[];
  mapaUbicacion: MapaRaw;
  descripcionComoLlegar: string | null;
};

type NegocioRaw = {
  nombreFantasia: string | null;
  nombreLegal: string | null;
  cuit: string | null;
  logoOficialUrl: string | null;
  descripcion: string | null;
  productos: ProductoRaw[];
  mediosContacto: ContactoRaw[];
  estadoProductosOrganicos: EstadoOrganicosRaw;
  tiendaOnlineUrl: string | null;
  sitioWebUrl: string | null;
  modalidadesVenta: ModalidadVenta[];
  ubicaciones: UbicacionRaw[];
  fuentes: FuenteRaw[];
  observaciones: string | null;
};

type SnapshotRaw = {
  snapshotVersion: number;
  pais: {
    codigoIso2: string;
    nombre: string;
  };
  generadoEn: string;
  negocios: NegocioRaw[];
};

type ProductoNormalizado = {
  nombre: string;
  categoria: string | null;
};

type ContactoNormalizado = {
  tipo: TipoContacto;
  valor: string;
  ubicacionId: string | null;
};

type MapaNormalizado = {
  latitud: number | null;
  longitud: number | null;
  url: string | null;
  proveedor: "google_maps";
};

type UbicacionNormalizada = {
  id: string;
  tipo: TipoUbicacion;
  nombreSucursal: string | null;
  direccion: {
    texto: string | null;
    divisionId: string | null;
    provincia: string | null;
    ciudad: string | null;
    codigoPostal: string | null;
  };
  imagenes: string[];
  mapa: MapaNormalizado;
  descripcionComoLlegar: string | null;
};

type FuenteNormalizada = {
  tipo: string;
  url: string;
};

type NegocioNormalizado = {
  id: string;
  nombreFantasia: string | null;
  nombreLegal: string | null;
  cuit: string | null;
  logoOficialUrl: string | null;
  descripcion: string | null;
  productos: ProductoNormalizado[];
  contactos: ContactoNormalizado[];
  estadoProductosOrganicos: EstadoOrganicosNormalizado;
  tiendaOnlineUrl: string | null;
  sitioWebUrl: string | null;
  modalidadesVenta: ModalidadVenta[];
  ubicaciones: UbicacionNormalizada[];
  fuentes: FuenteNormalizada[];
  observaciones: string | null;
};

type DatasetNormalizado = {
  schemaVersion: 1;
  source: {
    snapshotVersion: number;
    generadoEn: string;
    sha256: string;
  };
  pais: {
    id: "AR";
    nombre: "Argentina";
  };
  negocios: NegocioNormalizado[];
};

function normalizarTexto(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;

  const normalizado = value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

  return normalizado.length > 0 ? normalizado : null;
}

function requerirTexto(value: unknown, campo: string): string {
  if (typeof value !== "string") {
    throw new Error(`${campo}: se esperaba un string.`);
  }

  const normalizado = normalizarTexto(value);

  if (!normalizado) {
    throw new Error(`${campo}: no puede estar vacío.`);
  }

  return normalizado;
}

function normalizarUrl(
  value: string | null | undefined,
  campo: string,
): string | null {
  const texto = normalizarTexto(value);

  if (!texto) return null;

  try {
    return new URL(texto).toString();
  } catch {
    throw new Error(`${campo}: URL inválida: ${texto}`);
  }
}

function normalizarCuit(value: string | null): string | null {
  const texto = normalizarTexto(value);

  if (!texto) return null;

  const digitos = texto.replace(/\D/g, "");

  if (digitos.length !== 11) {
    throw new Error(`CUIT inválido: ${texto}`);
  }

  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
}

function slug(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "sin-id";
}

function hashCorto(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex")
    .slice(0, 8);
}

function sha256(value: string): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function deduplicarStrings(values: string[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];

  for (const value of values) {
    const normalizado = normalizarTexto(value);
    if (!normalizado) continue;

    const clave = normalizado.toLocaleLowerCase("es-AR");

    if (vistos.has(clave)) continue;

    vistos.add(clave);
    salida.push(normalizado);
  }

  return salida;
}

function normalizarEstadoOrganicos(
  value: EstadoOrganicosRaw,
): EstadoOrganicosNormalizado {
  const mapa: Record<
    EstadoOrganicosRaw,
    EstadoOrganicosNormalizado
  > = {
    TODOS: "todos",
    ALGUNOS: "algunos",
    NINGUNO: "ninguno",
    NO_VERIFICADO: "no_verificado",
  };

  const normalizado = mapa[value];

  if (!normalizado) {
    throw new Error(
      `estadoProductosOrganicos inválido: ${String(value)}`,
    );
  }

  return normalizado;
}

function normalizarCoordenada(
  value: number | null,
  min: number,
  max: number,
  campo: string,
): number | null {
  if (value == null) return null;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${campo}: coordenada inválida.`);
  }

  return value;
}

function crearIdsUnicos(
  candidatos: string[],
): string[] {
  const usados = new Set<string>();

  return candidatos.map((candidato, index) => {
    let id = candidato;

    if (!usados.has(id)) {
      usados.add(id);
      return id;
    }

    id = `${candidato}-${index + 1}`;

    while (usados.has(id)) {
      id = `${candidato}-${index + 1}-${hashCorto(id)}`;
    }

    usados.add(id);
    return id;
  });
}

function normalizarProductos(
  productos: ProductoRaw[],
  negocio: string,
): ProductoNormalizado[] {
  if (!Array.isArray(productos)) {
    throw new Error(
      `${negocio}: productos debe ser un array.`,
    );
  }

  if (productos.length > 20) {
    throw new Error(
      `${negocio}: productos supera el máximo de 20.`,
    );
  }

  const vistos = new Set<string>();
  const salida: ProductoNormalizado[] = [];

  for (const producto of productos) {
    const nombre = requerirTexto(
      producto?.nombre,
      `${negocio}.productos[].nombre`,
    );

    const categoria = normalizarTexto(
      producto?.categoria,
    );

    const clave =
      `${nombre}|${categoria ?? ""}`.toLocaleLowerCase(
        "es-AR",
      );

    if (vistos.has(clave)) continue;

    vistos.add(clave);

    salida.push({
      nombre,
      categoria,
    });
  }

  return salida;
}

function normalizarUbicaciones(
  ubicaciones: UbicacionRaw[],
  negocio: string,
): {
  ubicaciones: UbicacionNormalizada[];
  refAId: Map<string, string>;
} {
  if (!Array.isArray(ubicaciones)) {
    throw new Error(
      `${negocio}: ubicaciones debe ser un array.`,
    );
  }

  const candidatosId = ubicaciones.map((ubicacion, index) => {
    const nombreSucursal = normalizarTexto(
      ubicacion.nombreSucursal,
    );
    const ciudad = normalizarTexto(ubicacion.ciudad);
    const direccion = normalizarTexto(
      ubicacion.direccionFisica,
    );

    return slug(
      nombreSucursal ??
        [ciudad, direccion].filter(Boolean).join(" ") ??
        `ubicacion-${index + 1}`,
    );
  });

  const ids = crearIdsUnicos(candidatosId);
  const refAId = new Map<string, string>();

  const salida = ubicaciones.map((ubicacion, index) => {
    const nombreSucursal = normalizarTexto(
      ubicacion.nombreSucursal,
    );
    const provincia = normalizarTexto(
      ubicacion.provincia,
    );
    const ciudad = normalizarTexto(ubicacion.ciudad);
    const direccionFisica = normalizarTexto(
      ubicacion.direccionFisica,
    );

    const id = ids[index];

    if (nombreSucursal) {
      refAId.set(
        nombreSucursal.toLocaleLowerCase("es-AR"),
        id,
      );
    }

    if (
      ubicacion.tipo !== "fisica" &&
      ubicacion.tipo !== "online" &&
      ubicacion.tipo !== "mixta"
    ) {
      throw new Error(
        `${negocio}.ubicaciones[${index}].tipo inválido.`,
      );
    }

    const proveedor =
      normalizarTexto(
        ubicacion.mapaUbicacion?.proveedorMapa,
      ) ?? "google_maps";

    if (proveedor !== "google_maps") {
      throw new Error(
        `${negocio}.ubicaciones[${index}]: proveedor de mapa no soportado: ${proveedor}`,
      );
    }

    return {
      id,
      tipo: ubicacion.tipo,
      nombreSucursal,
      direccion: {
        texto: direccionFisica,
        divisionId: provincia ? slug(provincia) : null,
        provincia,
        ciudad,
        codigoPostal: normalizarTexto(
          ubicacion.codigoPostal,
        ),
      },
      imagenes: deduplicarStrings(
        Array.isArray(ubicacion.imagenesNegocioFisico)
          ? ubicacion.imagenesNegocioFisico.map((url) => {
              const normalizada = normalizarUrl(
                url,
                `${negocio}.ubicaciones[${index}].imagenesNegocioFisico[]`,
              );
              return normalizada ?? "";
            })
          : [],
      ),
      mapa: {
        latitud: normalizarCoordenada(
          ubicacion.mapaUbicacion?.latitud ?? null,
          -90,
          90,
          `${negocio}.ubicaciones[${index}].mapa.latitud`,
        ),
        longitud: normalizarCoordenada(
          ubicacion.mapaUbicacion?.longitud ?? null,
          -180,
          180,
          `${negocio}.ubicaciones[${index}].mapa.longitud`,
        ),
        url: normalizarUrl(
          ubicacion.mapaUbicacion?.urlMapaNegocio ??
            null,
          `${negocio}.ubicaciones[${index}].mapa.url`,
        ),
        proveedor: "google_maps" as const,
      },
      descripcionComoLlegar: normalizarTexto(
        ubicacion.descripcionComoLlegar,
      ),
    };
  });

  return {
    ubicaciones: salida,
    refAId,
  };
}

function normalizarContactos(
  contactos: ContactoRaw[],
  refAId: Map<string, string>,
  negocio: string,
): ContactoNormalizado[] {
  if (!Array.isArray(contactos)) {
    throw new Error(
      `${negocio}: mediosContacto debe ser un array.`,
    );
  }

  const tiposPermitidos = new Set<TipoContacto>([
    "telefono",
    "whatsapp",
    "email",
    "instagram",
    "facebook",
    "tiktok",
    "otro",
  ]);

  const vistos = new Set<string>();
  const salida: ContactoNormalizado[] = [];

  for (const contacto of contactos) {
    if (!tiposPermitidos.has(contacto.tipo)) {
      throw new Error(
        `${negocio}: tipo de contacto inválido: ${String(contacto.tipo)}`,
      );
    }

    const valor = requerirTexto(
      contacto.valor,
      `${negocio}.mediosContacto[].valor`,
    );

    const ref = normalizarTexto(
      contacto.ubicacionRef,
    );

    let ubicacionId: string | null = null;

    if (ref) {
      ubicacionId =
        refAId.get(ref.toLocaleLowerCase("es-AR")) ??
        null;

      if (!ubicacionId) {
        throw new Error(
          `${negocio}: el contacto referencia una ubicación inexistente: ${ref}`,
        );
      }
    }

    const clave =
      `${contacto.tipo}|${valor}|${ubicacionId ?? ""}`.toLocaleLowerCase(
        "es-AR",
      );

    if (vistos.has(clave)) continue;

    vistos.add(clave);

    salida.push({
      tipo: contacto.tipo,
      valor,
      ubicacionId,
    });
  }

  return salida;
}

function normalizarFuentes(
  fuentes: FuenteRaw[],
  negocio: string,
): FuenteNormalizada[] {
  if (!Array.isArray(fuentes) || fuentes.length === 0) {
    throw new Error(
      `${negocio}: debe existir al menos una fuente.`,
    );
  }

  const vistos = new Set<string>();
  const salida: FuenteNormalizada[] = [];

  for (const fuente of fuentes) {
    const tipo = requerirTexto(
      fuente.tipo,
      `${negocio}.fuentes[].tipo`,
    );

    const url = normalizarUrl(
      fuente.url,
      `${negocio}.fuentes[].url`,
    );

    if (!url) {
      throw new Error(
        `${negocio}: una fuente no puede tener URL vacía.`,
      );
    }

    const clave = `${tipo}|${url}`;

    if (vistos.has(clave)) continue;

    vistos.add(clave);

    salida.push({
      tipo,
      url,
    });
  }

  return salida;
}

function normalizarNegocio(
  negocio: NegocioRaw,
  id: string,
): NegocioNormalizado {
  const nombreFantasia = normalizarTexto(
    negocio.nombreFantasia,
  );

  const nombreLegal = normalizarTexto(
    negocio.nombreLegal,
  );

  const nombreIdentificatorio =
    nombreFantasia ?? nombreLegal;

  if (!nombreIdentificatorio) {
    throw new Error(
      `Negocio ${id}: debe tener nombreFantasia o nombreLegal.`,
    );
  }

  const { ubicaciones, refAId } =
    normalizarUbicaciones(
      negocio.ubicaciones,
      nombreIdentificatorio,
    );

  return {
    id,
    nombreFantasia,
    nombreLegal,
    cuit: normalizarCuit(negocio.cuit),
    logoOficialUrl: normalizarUrl(
      negocio.logoOficialUrl,
      `${nombreIdentificatorio}.logoOficialUrl`,
    ),
    descripcion: normalizarTexto(
      negocio.descripcion,
    ),
    productos: normalizarProductos(
      negocio.productos,
      nombreIdentificatorio,
    ),
    contactos: normalizarContactos(
      negocio.mediosContacto,
      refAId,
      nombreIdentificatorio,
    ),
    estadoProductosOrganicos:
      normalizarEstadoOrganicos(
        negocio.estadoProductosOrganicos,
      ),
    tiendaOnlineUrl: normalizarUrl(
      negocio.tiendaOnlineUrl,
      `${nombreIdentificatorio}.tiendaOnlineUrl`,
    ),
    sitioWebUrl: normalizarUrl(
      negocio.sitioWebUrl,
      `${nombreIdentificatorio}.sitioWebUrl`,
    ),
    modalidadesVenta: deduplicarStrings(
      negocio.modalidadesVenta,
    ) as ModalidadVenta[],
    ubicaciones,
    fuentes: normalizarFuentes(
      negocio.fuentes,
      nombreIdentificatorio,
    ),
    observaciones: normalizarTexto(
      negocio.observaciones,
    ),
  };
}

function validarSnapshot(
  value: unknown,
): asserts value is SnapshotRaw {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "El snapshot raíz debe ser un objeto JSON.",
    );
  }

  const snapshot = value as Partial<SnapshotRaw>;

  if (!Array.isArray(snapshot.negocios)) {
    throw new Error(
      "El snapshot debe contener negocios[].",
    );
  }

  if (
    !snapshot.pais ||
    snapshot.pais.codigoIso2 !== "AR"
  ) {
    throw new Error(
      "Este normalizador espera un snapshot de Argentina (AR).",
    );
  }

  if (typeof snapshot.snapshotVersion !== "number") {
    throw new Error(
      "snapshotVersion debe ser numérico.",
    );
  }

  if (typeof snapshot.generadoEn !== "string") {
    throw new Error(
      "generadoEn debe existir en el snapshot.",
    );
  }
}

async function main(): Promise<void> {
  const sourceText = await readFile(
    INPUT_PATH,
    "utf8",
  );

  const sourceSha256 = sha256(sourceText);
  const raw: unknown = JSON.parse(sourceText);

  validarSnapshot(raw);

  const ids = crearIdsUnicos(
    raw.negocios.map((negocio, index) => {
      const nombre =
        normalizarTexto(negocio.nombreFantasia) ??
        normalizarTexto(negocio.nombreLegal);

      if (!nombre) {
        return `negocio-${index + 1}`;
      }

      return slug(nombre);
    }),
  );

  const negocios = raw.negocios
    .map((negocio, index) =>
      normalizarNegocio(
        negocio,
        ids[index],
      ),
    )
    .sort((a, b) => {
      const nombreA =
        a.nombreFantasia ?? a.nombreLegal ?? a.id;
      const nombreB =
        b.nombreFantasia ?? b.nombreLegal ?? b.id;

      return nombreA.localeCompare(
        nombreB,
        "es-AR",
        { sensitivity: "base" },
      );
    });

  const output: DatasetNormalizado = {
    schemaVersion: 1,
    source: {
      snapshotVersion: raw.snapshotVersion,
      generadoEn: raw.generadoEn,
      sha256: sourceSha256,
    },
    pais: {
      id: "AR",
      nombre: "Argentina",
    },
    negocios,
  };

  await mkdir(OUTPUT_DIR, {
    recursive: true,
  });

  const tempPath = `${OUTPUT_PATH}.tmp`;

  await writeFile(
    tempPath,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );

  await rename(tempPath, OUTPUT_PATH);

  console.log(
    `Normalización completada: ${negocios.length} negocios.`,
  );
  console.log(
    `Entrada: ${path.relative(process.cwd(), INPUT_PATH)}`,
  );
  console.log(
    `Salida: ${path.relative(process.cwd(), OUTPUT_PATH)}`,
  );
  console.log(
    `SHA-256 fuente: ${sourceSha256}`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "Error al normalizar negocios naturistas:",
  );
  console.error(error);
  process.exitCode = 1;
});
