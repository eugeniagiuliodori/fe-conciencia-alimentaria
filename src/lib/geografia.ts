import type {
  GeografiaIndice,
  GeografiaPais,
} from "@/types/geografia";

let solicitudPaisesEnCurso: Promise<GeografiaIndice> | null = null;

const solicitudesPaisEnCurso = new Map<
  string,
  Promise<GeografiaPais>
>();

export function getPaises(): Promise<GeografiaIndice> {
  if (solicitudPaisesEnCurso) {
    return solicitudPaisesEnCurso;
  }

  const solicitud = fetch(
    "/data/geografia/countries.json",
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "No se pudieron cargar los países.",
        );
      }

      return response.json() as Promise<GeografiaIndice>;
    })
    .finally(() => {
      solicitudPaisesEnCurso = null;
    });

  solicitudPaisesEnCurso = solicitud;

  return solicitud;
}

export function getPais(
  id: string,
): Promise<GeografiaPais> {
  const solicitudExistente =
    solicitudesPaisEnCurso.get(id);

  if (solicitudExistente) {
    return solicitudExistente;
  }

  const solicitud = fetch(
    `/data/geografia/countries/${encodeURIComponent(id)}.json`,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `No se pudo cargar el país ${id}.`,
        );
      }

      return response.json() as Promise<GeografiaPais>;
    })
    .finally(() => {
      solicitudesPaisEnCurso.delete(id);
    });

  solicitudesPaisEnCurso.set(id, solicitud);

  return solicitud;
}