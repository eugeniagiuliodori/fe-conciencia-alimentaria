// src/lib/negocios.ts

import type {
  EstadoProductosOrganicos,
  NegocioPublico,
} from "@/types/negocios";

export type FiltrosNegocios = {
  divisionId?: string;
  ciudad?: string;
  estadoProductosOrganicos?: EstadoProductosOrganicos;
};

const solicitudesEnCurso = new Map<
  string,
  Promise<NegocioPublico[]>
>();

function construirUrl(
  filtros: FiltrosNegocios,
): string {
  const params = new URLSearchParams();

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

  if (filtros.estadoProductosOrganicos) {
    params.set(
      "estadoProductosOrganicos",
      filtros.estadoProductosOrganicos,
    );
  }

  const query = params.toString();

  return query
    ? `/api/negocios?${query}`
    : "/api/negocios";
}

export function getNegocios(
  filtros: FiltrosNegocios = {},
): Promise<NegocioPublico[]> {
  const url = construirUrl(filtros);

  const solicitudExistente =
    solicitudesEnCurso.get(url);

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(url, {
  cache: "no-store",
})
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron obtener los negocios naturistas.",
        );
      }

      return response.json() as Promise<
        NegocioPublico[]
      >;
    })
    .finally(() => {
      solicitudesEnCurso.delete(url);
    });

  solicitudesEnCurso.set(
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
    no_verificado: "No verificado",
  };

  return textos[estado];
}