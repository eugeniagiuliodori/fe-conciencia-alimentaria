// src/lib/negocios.ts

import type {
  ConsultaRangoNegocios,
  EstadoProductosOrganicos,
  FiltrosNegocios,
  NegocioPublico,
  ResultadoRangoNegocios,
} from "@/types/negocios";

const solicitudesNegociosEnCurso =
  new Map<
    string,
    Promise<NegocioPublico[]>
  >();

const solicitudesRangoEnCurso =
  new Map<
    string,
    Promise<ResultadoRangoNegocios>
  >();

function agregarFiltros(
  params: URLSearchParams,
  filtros: FiltrosNegocios,
) {
  if (filtros.divisionId) {
    params.set(
      "divisionId",
      filtros.divisionId,
    );
  }

  if (filtros.ciudad) {
    params.set(
      "ciudad",
      filtros.ciudad,
    );
  }

  if (
    filtros.estadoProductosOrganicos
  ) {
    params.set(
      "estadoProductosOrganicos",
      filtros.estadoProductosOrganicos,
    );
  }
}

function construirUrlNegocios(
  filtros: FiltrosNegocios,
): string {
  const params =
    new URLSearchParams();

  agregarFiltros(
    params,
    filtros,
  );

  const query =
    params.toString();

  return query
    ? `/api/negocios?${query}`
    : "/api/negocios";
}

function construirUrlRango(
  consulta: ConsultaRangoNegocios,
): string {
  const {
    offset,
    limit,
    ...filtros
  } = consulta;

  const params =
    new URLSearchParams();

  agregarFiltros(
    params,
    filtros,
  );

  params.set(
    "offset",
    String(offset),
  );

  params.set(
    "limit",
    String(limit),
  );

  return `/api/negocios/data-range?${params.toString()}`;
}

export function getNegocios(
  filtros: FiltrosNegocios = {},
): Promise<NegocioPublico[]> {
  const url =
    construirUrlNegocios(filtros);

  const solicitudExistente =
    solicitudesNegociosEnCurso.get(
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
          "No se pudieron obtener los negocios naturistas",
        );
      }

      return response.json() as Promise<
        NegocioPublico[]
      >;
    })
    .finally(() => {
      solicitudesNegociosEnCurso.delete(
        url,
      );
    });

  solicitudesNegociosEnCurso.set(
    url,
    solicitud,
  );

  return solicitud;
}

export function getRangoNegocios(
  consulta: ConsultaRangoNegocios,
): Promise<ResultadoRangoNegocios> {
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
          "No se pudo obtener el rango de negocios naturistas",
        );
      }

      return response.json() as Promise<
        ResultadoRangoNegocios
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

export function textoOrganicos(
  estado: EstadoProductosOrganicos,
): string {
  const textos: Record<
    EstadoProductosOrganicos,
    string
  > = {
    todos: "Todos",
    algunos: "Algunos",
    ninguno: "Ninguno",
    no_verificado:
      "No verificado",
  };

  return textos[estado];
}

export type {
  ConsultaRangoNegocios,
  FiltrosNegocios,
} from "@/types/negocios";