// src/lib/geografia.ts

import type {
  DivisionGeografia,
  PaisGeografia,
} from "@/types/geografia";

let solicitudPaisesEnCurso:
  Promise<PaisGeografia[]> | null = null;

const solicitudesDivisionesEnCurso =
  new Map<
    string,
    Promise<DivisionGeografia[]>
  >();

const solicitudesCiudadesEnCurso =
  new Map<
    string,
    Promise<string[]>
  >();

export function getPaises(): Promise<
  PaisGeografia[]
> {
  if (solicitudPaisesEnCurso) {
    return solicitudPaisesEnCurso;
  }

  const solicitud = fetch(
    "/api/geografia/paises",
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron obtener los países.",
        );
      }

      return response.json() as Promise<
        PaisGeografia[]
      >;
    })
    .finally(() => {
      solicitudPaisesEnCurso = null;
    });

  solicitudPaisesEnCurso = solicitud;

  return solicitud;
}

export function getDivisiones(
  paisId: string,
): Promise<DivisionGeografia[]> {
  const url =
    `/api/geografia/paises/` +
    `${encodeURIComponent(paisId)}/divisiones`;

  const solicitudExistente =
    solicitudesDivisionesEnCurso.get(url);

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `No se pudieron obtener las divisiones del país ${paisId}.`,
        );
      }

      return response.json() as Promise<
        DivisionGeografia[]
      >;
    })
    .finally(() => {
      solicitudesDivisionesEnCurso.delete(
        url,
      );
    });

  solicitudesDivisionesEnCurso.set(
    url,
    solicitud,
  );

  return solicitud;
}

export function getCiudades(
  paisId: string,
  divisionId: string,
): Promise<string[]> {
  const url =
    `/api/geografia/paises/` +
    `${encodeURIComponent(paisId)}/` +
    `divisiones/` +
    `${encodeURIComponent(divisionId)}/` +
    `ciudades`;

  const solicitudExistente =
    solicitudesCiudadesEnCurso.get(url);

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron obtener las ciudades.",
        );
      }

      return response.json() as Promise<
        string[]
      >;
    })
    .finally(() => {
      solicitudesCiudadesEnCurso.delete(
        url,
      );
    });

  solicitudesCiudadesEnCurso.set(
    url,
    solicitud,
  );

  return solicitud;
}