import type {
  PaginationItem,
} from "@/types/alimentosestacion";

type ConstruirPaginacionProps = {
  paginaActual: number;
  indiceInicial: number;
  filasPorPagina: number;
  totalAlimentos: number;
  cargando?: boolean;
  onPaginaChange: (pagina: number) => void;
};

function crearPaginacion(
  paginaActual: number,
  totalPaginas: number,
): PaginationItem[] {
  if (totalPaginas <= 7) {
    return Array.from(
      { length: totalPaginas },
      (_, index) => index + 1,
    );
  }

  if (paginaActual <= 4) {
    return [
      1,
      2,
      3,
      4,
      5,
      "ellipsis-end",
      totalPaginas,
    ];
  }

  if (paginaActual >= totalPaginas - 3) {
    return [
      1,
      "ellipsis-start",
      totalPaginas - 4,
      totalPaginas - 3,
      totalPaginas - 2,
      totalPaginas - 1,
      totalPaginas,
    ];
  }

  return [
    1,
    "ellipsis-start",
    paginaActual - 1,
    paginaActual,
    paginaActual + 1,
    "ellipsis-end",
    totalPaginas,
  ];
}

export function ConstruirPaginacion({
  paginaActual,
  indiceInicial,
  filasPorPagina,
  totalAlimentos,
  cargando = false,
  onPaginaChange,
}: ConstruirPaginacionProps) {
  const totalPaginas = Math.max(
    1,
    Math.ceil(totalAlimentos / filasPorPagina),
  );

  const paginas = crearPaginacion(
    paginaActual,
    totalPaginas,
  );

  const inicioMostrado =
    totalAlimentos === 0 ? 0 : indiceInicial + 1;

  const finMostrado = Math.min(
    indiceInicial + filasPorPagina,
    totalAlimentos,
  );

  return (
    <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6">
      <p className="text-center text-sm text-muted sm:text-left">
        Mostrando{" "}
        <span className="font-semibold text-foreground">
          {inicioMostrado}
        </span>
        {" – "}
        <span className="font-semibold text-foreground">
          {finMostrado}
        </span>{" "}
        de{" "}
        <span className="font-semibold text-foreground">
          {totalAlimentos}
        </span>
      </p>

      {totalPaginas > 1 && (
        <nav
          aria-label="Paginación de alimentos"
          className="flex flex-wrap items-center justify-center gap-1.5"
        >
          <button
            type="button"
            onClick={() =>
              onPaginaChange(
                Math.max(1, paginaActual - 1),
              )
            }
            disabled={cargando || paginaActual === 1}
            className="flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>

          {paginas.map((item) => {
            if (typeof item !== "number") {
              return (
                <span
                  key={item}
                  aria-hidden="true"
                  className="flex h-10 min-w-8 items-center justify-center px-1 text-muted"
                >
                  …
                </span>
              );
            }

            const activa = item === paginaActual;

            return (
              <button
                key={item}
                type="button"
                aria-label={`Ir a página ${item}`}
                aria-current={activa ? "page" : undefined}
                onClick={() => onPaginaChange(item)}
                disabled={cargando || activa}
                className={`
                  flex h-10 min-w-10 cursor-pointer items-center justify-center
                  rounded-lg border px-3 text-sm font-semibold transition
                  focus-visible:outline focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-accent
                  disabled:cursor-not-allowed
                  ${
                    activa
                      ? "border-accent bg-accent text-white shadow-[0_3px_10px_rgba(105,66,115,0.25)]"
                      : "border-line bg-white text-accent hover:border-accent hover:bg-accent-soft disabled:opacity-40"
                  }
                `}
              >
                {item}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() =>
              onPaginaChange(
                Math.min(
                  totalPaginas,
                  paginaActual + 1,
                ),
              )
            }
            disabled={
              cargando || paginaActual === totalPaginas
            }
            className="flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente →
          </button>
        </nav>
      )}
    </div>
  );
}
