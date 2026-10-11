import type {
  NegocioPublico,
} from "@/types/negocios";

export function UbicacionesNegocio({
  negocio,
}: {
  negocio: NegocioPublico;
}) {
  if (negocio.ubicaciones.length === 0) {
    return (
      <span className="text-xs text-muted">
        Sin ubicación informada
      </span>
    );
  }

  return (
    <div className="space-y-4">
      {negocio.ubicaciones.map(
        (ubicacion) => (
          <div
            key={ubicacion.id}
            className="
              space-y-1
              border-b border-line/70
              pb-3
              last:border-b-0
              last:pb-0
            "
          >
            {ubicacion.nombreSucursal && (
              <p className="text-xs font-semibold text-foreground">
                {ubicacion.nombreSucursal}
              </p>
            )}

            <p className="text-xs text-muted">
              {ubicacion.tipo === "online"
                ? "Atención online"
                : ubicacion.tipo === "mixta"
                  ? "Presencial y online"
                  : "Local físico"}
            </p>

            {ubicacion.direccion.texto && (
              <p className="text-xs leading-relaxed text-muted">
                {ubicacion.direccion.texto}
              </p>
            )}

            {(ubicacion.direccion.ciudad ||
              ubicacion.direccion.provincia) && (
              <p className="text-xs text-muted">
                {[
                  ubicacion.direccion.ciudad,
                  ubicacion.direccion.provincia,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}

            {ubicacion.descripcionComoLlegar && (
              <p className="text-xs italic text-muted">
                {
                  ubicacion.descripcionComoLlegar
                }
              </p>
            )}

            {ubicacion.mapa.url && (
              <a
                href={ubicacion.mapa.url}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-block
                  text-xs font-semibold
                  text-accent
                  hover:underline
                "
              >
                Ver mapa
              </a>
            )}

            {ubicacion.mapa.latitud !== null &&
              ubicacion.mapa.longitud !==
                null && (
                <p className="text-[0.7rem] text-muted">
                  {
                    ubicacion.mapa.latitud
                  },{" "}
                  {
                    ubicacion.mapa.longitud
                  }
                </p>
              )}

            {ubicacion.imagenes.length >
              0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {ubicacion.imagenes.map(
                  (imagen) => (
                    <img
                      key={imagen}
                      src={imagen}
                      alt=""
                      className="
                        h-14 w-14
                        rounded-lg
                        border border-line
                        object-cover
                      "
                    />
                  ),
                )}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
