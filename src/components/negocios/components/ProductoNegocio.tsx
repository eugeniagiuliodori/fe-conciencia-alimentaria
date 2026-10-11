import type {
  NegocioPublico,
} from "@/types/negocios";


export function ProductosNegocio({
  negocio,
}: {
  negocio: NegocioPublico;
}) {
  if (negocio.productos.length === 0) {
    return (
      <span className="text-xs text-muted">
        Sin productos informados
      </span>
    );
  }

  return (
    <ul className="space-y-1">
      {negocio.productos.map(
        (producto) => (
          <li
            key={`${negocio.id}-${producto.nombre}`}
            className="text-xs leading-relaxed text-muted"
          >
            <span className="text-foreground">
              {producto.nombre}
            </span>

            {producto.categoria && (
              <>
                {" "}
                <span className="text-[0.7rem]">
                  · {producto.categoria}
                </span>
              </>
            )}
          </li>
        ),
      )}
    </ul>
  );
}
