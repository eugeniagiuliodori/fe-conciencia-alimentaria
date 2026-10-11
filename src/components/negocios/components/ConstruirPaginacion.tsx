import { PaginationItem } from "@/types/negocios";


export function construirPaginacion(
  paginaActual: number,
  totalPaginas: number,
): PaginationItem[] {
  if (totalPaginas <= 7) {
    return Array.from(
      { length: totalPaginas },
      (_, index) => index + 1,
    );
  }

  const paginas = new Set<number>([
    1,
    2,
    paginaActual - 1,
    paginaActual,
    paginaActual + 1,
    totalPaginas - 1,
    totalPaginas,
  ]);

  const validas = [...paginas]
    .filter(
      (pagina) =>
        pagina >= 1 &&
        pagina <= totalPaginas,
    )
    .sort((a, b) => a - b);

  const resultado: PaginationItem[] = [];

  validas.forEach((pagina, index) => {
    const anterior = validas[index - 1];

    if (
      anterior &&
      pagina - anterior > 1
    ) {
      resultado.push("ellipsis");
    }

    resultado.push(pagina);
  });

  return resultado;
}