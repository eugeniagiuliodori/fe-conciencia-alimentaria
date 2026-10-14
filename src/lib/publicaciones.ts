// src/lib/publicaciones.ts

import type {
  Publication,
} from "@/data/publications";
import type {
  ConsultaRangoPublicaciones,
  ResultadoRangoPublicaciones,
} from "@/types/publicaciones";

const solicitudesPublicacionesEnCurso =
  new Map<
    string,
    Promise<Publication[]>
  >();

const solicitudesRangoEnCurso =
  new Map<
    string,
    Promise<ResultadoRangoPublicaciones>
  >();

export function getPublicaciones(): Promise<
  Publication[]
> {
  const url =
    "/api/publicaciones";

  const solicitudExistente =
    solicitudesPublicacionesEnCurso.get(
      url,
    );

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(
    url,
    {
      cache: "no-store",
    },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron obtener las publicaciones.",
        );
      }

      return response.json() as Promise<
        Publication[]
      >;
    })
    .finally(() => {
      solicitudesPublicacionesEnCurso.delete(
        url,
      );
    });

  solicitudesPublicacionesEnCurso.set(
    url,
    solicitud,
  );

  return solicitud;
}

function construirUrlRango(
  consulta: ConsultaRangoPublicaciones,
): string {
  const params =
    new URLSearchParams();

  params.set(
    "offset",
    String(consulta.offset),
  );

  params.set(
    "limit",
    String(consulta.limit),
  );

  return `/api/publicaciones/data-range?${params.toString()}`;
}

export function getRangoPublicaciones(
  consulta: ConsultaRangoPublicaciones,
): Promise<ResultadoRangoPublicaciones> {
  const url =
    construirUrlRango(consulta);

  const solicitudExistente =
    solicitudesRangoEnCurso.get(
      url,
    );

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(
    url,
    {
      cache: "no-store",
    },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudo obtener el rango de publicaciones.",
        );
      }

      return response.json() as Promise<
        ResultadoRangoPublicaciones
      >;
    })
    .finally(() => {
      solicitudesRangoEnCurso.delete(
        url,
      );
    });

  solicitudesRangoEnCurso.set(
    url,
    solicitud,
  );

  return solicitud;
}

export type {
  ConsultaRangoPublicaciones,
  ResultadoRangoPublicaciones,
} from "@/types/publicaciones";