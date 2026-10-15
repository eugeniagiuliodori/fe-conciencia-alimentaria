import type {
  Alimento,
  ConsultaRangoAlimentosEstacion,
  Estacion,
  ResultadoRangoAlimentosEstacion,
} from "@/types/alimentosestacion";

const solicitudesAlimentosEnCurso =
  new Map<string, Promise<Alimento[]>>();

const solicitudesRangoEnCurso =
  new Map<
    string,
    Promise<ResultadoRangoAlimentosEstacion>
  >();

function construirUrlAlimentos(
  estacion: Estacion,
): string {
  const params = new URLSearchParams();
  params.set("estacion", estacion);

  return `/api/alimentos-estacion?${params.toString()}`;
}

function construirUrlRango(
  consulta: ConsultaRangoAlimentosEstacion,
): string {
  const params = new URLSearchParams();
  params.set("estacion", consulta.estacion);
  params.set("offset", String(consulta.offset));
  params.set("limit", String(consulta.limit));

  return `/api/alimentos-estacion/data-range?${params.toString()}`;
}

export function getAlimentosPorEstacion(
  estacion: Estacion,
): Promise<Alimento[]> {
  const url = construirUrlAlimentos(estacion);
  const existente = solicitudesAlimentosEnCurso.get(url);

  if (existente) {
    return existente;
  }

  const solicitud = fetch(url, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron obtener los alimentos de estación.",
        );
      }

      return response.json() as Promise<Alimento[]>;
    })
    .finally(() => {
      solicitudesAlimentosEnCurso.delete(url);
    });

  solicitudesAlimentosEnCurso.set(url, solicitud);
  return solicitud;
}

export function getRangoAlimentosEstacion(
  consulta: ConsultaRangoAlimentosEstacion,
): Promise<ResultadoRangoAlimentosEstacion> {
  const url = construirUrlRango(consulta);
  const existente = solicitudesRangoEnCurso.get(url);

  if (existente) {
    return existente;
  }

  const solicitud = fetch(url, {
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudo obtener el rango de alimentos de estación.",
        );
      }

      return response.json() as Promise<
        ResultadoRangoAlimentosEstacion
      >;
    })
    .finally(() => {
      solicitudesRangoEnCurso.delete(url);
    });

  solicitudesRangoEnCurso.set(url, solicitud);
  return solicitud;
}

export type {
  ConsultaRangoAlimentosEstacion,
  ResultadoRangoAlimentosEstacion,
} from "@/types/alimentosestacion";
