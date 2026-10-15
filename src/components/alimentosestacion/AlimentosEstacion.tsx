"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  getRangoAlimentosEstacion,
} from "@/lib/alimentos-estacion";
import type {
  Estacion,
  ResultadoRangoAlimentosEstacion,
} from "@/types/alimentosestacion";

import { ConstruirPaginacion } from "./components/ConstruirPaginacion";

const FILAS_DISPONIBLES = [5, 10, 15];

export function AlimentosEstacion() {
  const [estacion, setEstacion] =
    useState<Estacion>("primavera");

  const [paginaActual, setPaginaActual] =
    useState(1);

  const [filasPorPagina, setFilasPorPagina] =
    useState(5);

  const [resultado, setResultado] =
    useState<ResultadoRangoAlimentosEstacion | null>(null);

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const indiceInicial =
    (paginaActual - 1) * filasPorPagina;

  useEffect(() => {
    let cancelado = false;

    async function cargarRango() {
      setCargando(true);
      setError(null);

      try {
        const datos = await getRangoAlimentosEstacion({
          estacion,
          offset: indiceInicial,
          limit: filasPorPagina,
        });

        if (!cancelado) {
          setResultado(datos);
        }
      } catch {
        if (!cancelado) {
          setError(
            "No se pudieron cargar los alimentos de estación.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarRango();

    return () => {
      cancelado = true;
    };
  }, [
    estacion,
    indiceInicial,
    filasPorPagina,
  ]);

  const alimentosPagina =
    resultado?.alimentos ?? [];

  const totalAlimentos =
    resultado?.total ?? 0;

  function cambiarEstacion(
    nuevaEstacion: Estacion,
  ) {
    setEstacion(nuevaEstacion);
    setPaginaActual(1);
    setResultado(null);
  }

  function cambiarFilasPorPagina(
    cantidad: number,
  ) {
    setFilasPorPagina(cantidad);
    setPaginaActual(1);
  }

  function cambiarPagina(
    pagina: number,
  ) {
    setPaginaActual(pagina);
  }

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
              disabled={cargando}
              className="
                min-h-11 rounded-lg border border-line bg-white px-3
                text-foreground outline-none transition
                focus:border-accent focus:ring-2 focus:ring-accent/20
                disabled:cursor-not-allowed disabled:opacity-50
              "
            >
              <option value="verano">Verano</option>
              <option value="otono">Otoño</option>
              <option value="invierno">Invierno</option>
              <option value="primavera">Primavera</option>
            </select>
          </div>

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
              disabled={cargando}
              className="
                min-h-11 rounded-lg border border-line bg-white px-3
                text-foreground outline-none transition
                focus:border-accent focus:ring-2 focus:ring-accent/20
                disabled:cursor-not-allowed disabled:opacity-50
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

        {!resultado && cargando && !error && (
          <div className="px-4 py-8 text-center text-sm text-muted sm:px-6">
            Cargando alimentos...
          </div>
        )}

        {error && (
          <div className="px-4 py-8 text-center text-sm text-muted sm:px-6">
            {error}
          </div>
        )}

        {resultado && !error && totalAlimentos === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted sm:px-6">
            No hay alimentos disponibles para esta estación.
          </div>
        )}

        {resultado && !error && totalAlimentos > 0 && (
          <>
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
                      className="border-b border-line transition-colors last:border-b-0 hover:bg-accent-soft/40"
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
                        {alimento.zona_principal_produccion.join(", ")}
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
                        {alimento.zona_principal_produccion.join(", ")}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <ConstruirPaginacion
              paginaActual={paginaActual}
              indiceInicial={indiceInicial}
              filasPorPagina={filasPorPagina}
              totalAlimentos={totalAlimentos}
              cargando={cargando}
              onPaginaChange={cambiarPagina}
            />
          </>
        )}
      </div>
    </section>
  );
}
