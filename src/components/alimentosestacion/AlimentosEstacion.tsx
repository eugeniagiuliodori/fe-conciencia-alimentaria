"use client";

import { useMemo, useState } from "react";
import alimentosPorEstacion from "@/data/alimentos_estacion.json";

type Estacion = keyof typeof alimentosPorEstacion;

type Alimento = {
  nombre_informal: string;
  nombre_cientifico: string;
  tipo: string;
  zona_principal_produccion: string[];
};

type PaginationItem =
  | number
  | "ellipsis-start"
  | "ellipsis-end";

const FILAS_DISPONIBLES = [5, 10, 15];

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

export function AlimentosEstacion() {
  const [estacion, setEstacion] =
    useState<Estacion>("primavera");

  const [paginaActual, setPaginaActual] = useState(1);

  const [filasPorPagina, setFilasPorPagina] =
    useState(5);

  const alimentos = useMemo(
    () =>
      Object.values(
        alimentosPorEstacion[estacion],
      ) as Alimento[],
    [estacion],
  );

  const totalPaginas = Math.ceil(
    alimentos.length / filasPorPagina,
  );

  const indiceInicial =
    (paginaActual - 1) * filasPorPagina;

  const alimentosPagina = alimentos.slice(
    indiceInicial,
    indiceInicial + filasPorPagina,
  );

  const paginas = crearPaginacion(
    paginaActual,
    totalPaginas,
  );

  const cambiarEstacion = (nuevaEstacion: Estacion) => {
    setEstacion(nuevaEstacion);
    setPaginaActual(1);
  };

  const cambiarFilasPorPagina = (cantidad: number) => {
    setFilasPorPagina(cantidad);
    setPaginaActual(1);
  };

  return (
    <section className="mx-auto w-full px-4 py-8 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_8px_26px_rgba(105,66,115,0.08)]">

        {/* CABECERA */}
        <div className="border-b border-line bg-accent-soft px-4 py-5 sm:px-6">
          <h2 className="font-display text-xl font-semibold text-accent sm:text-2xl">
            Alimentos de estación
          </h2>

          <p className="mt-1 text-sm text-muted">
            Explorá alimentos según la estación del año en Argentina.
          </p>
        </div>

        {/* CONTROLES */}
        <div className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">

          {/* ESTACIÓN */}
          <div>
            <label
              htmlFor="estacion"
              className="mb-1 block text-sm font-semibold text-accent"
            >
              Estación
            </label>

            <select
              id="estacion"
              value={estacion}
              onChange={(event) =>
                cambiarEstacion(
                  event.target.value as Estacion,
                )
              }
              className="
                min-h-11
                rounded-lg
                border border-line
                bg-white
                px-3
                text-foreground
                outline-none
                transition
                focus:border-accent
                focus:ring-2
                focus:ring-accent/20
              "
            >
              <option value="verano">Verano</option>
              <option value="otono">Otoño</option>
              <option value="invierno">Invierno</option>
              <option value="primavera">Primavera</option>
            </select>
          </div>

          {/* FILAS POR PÁGINA */}
          <div>
            <label
              htmlFor="filas"
              className="mb-1 block text-sm font-semibold text-accent"
            >
              Filas por página
            </label>

            <select
              id="filas"
              value={filasPorPagina}
              onChange={(event) =>
                cambiarFilasPorPagina(
                  Number(event.target.value),
                )
              }
              className="
                min-h-11
                rounded-lg
                border border-line
                bg-white
                px-3
                text-foreground
                outline-none
                transition
                focus:border-accent
                focus:ring-2
                focus:ring-accent/20
              "
            >
              {FILAS_DISPONIBLES.map((cantidad) => (
                <option key={cantidad} value={cantidad}>
                  {cantidad}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TABLA: TABLET / PC */}
        <div className="hidden md:block">
          <table className="w-full border-collapse text-left">
            <thead className="bg-[#faf8f5]">
              <tr className="border-b border-line">
                <th className="px-5 py-4 text-sm font-semibold text-accent">
                  Alimento
                </th>

                <th className="px-5 py-4 text-sm font-semibold text-accent">
                  Nombre científico
                </th>

                <th className="px-5 py-4 text-sm font-semibold text-accent">
                  Tipo
                </th>

                <th className="px-5 py-4 text-sm font-semibold text-accent">
                  Producción principal
                </th>
              </tr>
            </thead>

            <tbody>
              {alimentosPagina.map((alimento) => (
                <tr
                  key={alimento.nombre_cientifico}
                  className="
                    border-b border-line
                    transition-colors
                    last:border-b-0
                    hover:bg-accent-soft/40
                  "
                >
                  <td className="px-5 py-4 font-semibold text-foreground">
                    {alimento.nombre_informal}
                  </td>

                  <td className="px-5 py-4 font-serif italic text-muted">
                    {alimento.nombre_cientifico}
                  </td>

                  <td className="px-5 py-4 text-muted">
                    {alimento.tipo}
                  </td>

                  <td className="px-5 py-4 text-muted">
                    {alimento.zona_principal_produccion.join(
                      ", ",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MÓVIL */}
        <div className="divide-y divide-line md:hidden">
          {alimentosPagina.map((alimento) => (
            <article
              key={alimento.nombre_cientifico}
              className="space-y-3 px-4 py-5"
            >
              <div>
                <h3 className="text-lg font-semibold text-accent">
                  {alimento.nombre_informal}
                </h3>

                <p className="font-serif text-sm italic text-muted">
                  {alimento.nombre_cientifico}
                </p>
              </div>

              <div className="grid gap-3 text-sm">
                <div>
                  <span className="font-semibold text-foreground">
                    Tipo:
                  </span>{" "}
                  <span className="text-muted">
                    {alimento.tipo}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-foreground">
                    Producción:
                  </span>{" "}
                  <span className="text-muted">
                    {alimento.zona_principal_produccion.join(
                      ", ",
                    )}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* PIE + PAGINACIÓN */}
        <div className="flex flex-col gap-4 border-t border-line px-4 py-5 sm:px-6">

          <p className="text-center text-sm text-muted sm:text-left">
            Mostrando{" "}
            <span className="font-semibold text-foreground">
              {indiceInicial + 1}
            </span>
            {" – "}
            <span className="font-semibold text-foreground">
              {Math.min(
                indiceInicial + filasPorPagina,
                alimentos.length,
              )}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-foreground">
              {alimentos.length}
            </span>
          </p>

          {totalPaginas > 1 && (
            <nav
              aria-label="Paginación de alimentos"
              className="flex flex-wrap items-center justify-center gap-1.5"
            >
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
                    aria-current={
                      activa ? "page" : undefined
                    }
                    onClick={() =>
                      setPaginaActual(item)
                    }
                    className={`
                      flex h-10 min-w-10
                      cursor-pointer
                      items-center justify-center
                      rounded-lg
                      border
                      px-3
                      text-sm
                      font-semibold
                      transition
                      focus-visible:outline
                      focus-visible:outline-2
                      focus-visible:outline-offset-2
                      focus-visible:outline-accent

                      ${
                        activa
                          ? "border-accent bg-accent text-white shadow-[0_3px_10px_rgba(105,66,115,0.25)]"
                          : "border-line bg-white text-accent hover:border-accent hover:bg-accent-soft"
                      }
                    `}
                  >
                    {item}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}