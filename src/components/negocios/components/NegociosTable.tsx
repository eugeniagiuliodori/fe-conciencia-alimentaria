"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getRangoNegocios,
  textoOrganicos,
} from "@/lib/negocios";
import type {
  FiltrosNegocios,
  ResultadoRangoNegocios,
} from "@/types/negocios";

import { construirPaginacion } from "./ConstruirPaginacion";
import { ContactosNegocio } from "./ContactoNegocio";
import { EnlacesNegocio } from "./EnlacesNegocio";
import { NombreNegocio } from "./NombreNegocio";
import { ProductosNegocio } from "./ProductoNegocio";
import { UbicacionesNegocio } from "./UbicacionesNegocio";

const FILAS_POR_PAGINA = [
  5,
  10,
  15,
  20,
];

export function NegociosTable({
  filtros,
}: {
  filtros: FiltrosNegocios;
}) {
  const [
    paginaActual,
    setPaginaActual,
  ] = useState(1);

  const [
    filasPorPagina,
    setFilasPorPagina,
  ] = useState(5);

  const [
    resultado,
    setResultado,
  ] =
    useState<ResultadoRangoNegocios | null>(
      null,
    );

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [activa, setActiva] =
    useState(false);

  const claveFiltros = [
    filtros.divisionId ?? "",
    filtros.ciudad ?? "",
    filtros.estadoProductosOrganicos ??
      "",
  ].join("|");

  const claveFiltrosAnterior =
    useRef(claveFiltros);

  // Evita que tabla y slider consulten al BFF al mismo tiempo.
  // Coincide con el breakpoint xl usado en la UI.
  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 1280px)",
    );

    const actualizar = () => {
      setActiva(media.matches);
    };

    actualizar();

    media.addEventListener(
      "change",
      actualizar,
    );

    return () => {
      media.removeEventListener(
        "change",
        actualizar,
      );
    };
  }, []);

  useEffect(() => {
    if (!activa) {
      return;
    }

    /*
     * Si cambian los filtros, la navegación visual de la tabla
     * vuelve a la primera página antes de consultar el nuevo rango.
     */
    if (
      claveFiltrosAnterior.current !==
      claveFiltros
    ) {
      claveFiltrosAnterior.current =
        claveFiltros;

      if (paginaActual !== 1) {
        setPaginaActual(1);
        return;
      }
    }

    let cancelado = false;

    async function cargarRango() {
      setCargando(true);
      setError(null);

      const offset =
        (paginaActual - 1) *
        filasPorPagina;

      try {
        const datos =
          await getRangoNegocios({
            ...filtros,
            offset,
            limit:
              filasPorPagina,
          });

        if (cancelado) {
          return;
        }

        /*
         * Si el dataset cambió y la página actual quedó fuera
         * del rango válido, reposicionamos la tabla.
         */
        if (
          datos.total > 0 &&
          datos.negocios.length === 0 &&
          offset >= datos.total
        ) {
          setPaginaActual(
            Math.ceil(
              datos.total /
                filasPorPagina,
            ),
          );
          return;
        }

        setResultado(datos);
      } catch {
        if (!cancelado) {
          setError(
            "No se pudo cargar el rango de negocios.",
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
    activa,
    claveFiltros,
    filtros.divisionId,
    filtros.ciudad,
    filtros.estadoProductosOrganicos,
    paginaActual,
    filasPorPagina,
  ]);

  const total =
    resultado?.total ?? 0;

  const totalPaginas =
    total === 0
      ? 0
      : Math.ceil(
          total /
            filasPorPagina,
        );

  const botonesPaginacion =
    useMemo(
      () =>
        totalPaginas > 0
          ? construirPaginacion(
              paginaActual,
              totalPaginas,
            )
          : [],
      [
        paginaActual,
        totalPaginas,
      ],
    );

  function cambiarFilasPorPagina(
    cantidad: number,
  ) {
    setFilasPorPagina(cantidad);
    setPaginaActual(1);
  }

  function mostrarAnterior() {
    if (paginaActual > 1) {
      setPaginaActual(
        (actual) => actual - 1,
      );
    }
  }

  function mostrarSiguiente() {
    if (
      paginaActual < totalPaginas
    ) {
      setPaginaActual(
        (actual) => actual + 1,
      );
    }
  }

  // TABLA: xl en adelante.
  return (
    <div className="hidden xl:block">
      <div
        className="
          overflow-hidden
          rounded-[1.5rem]
          border border-line
          bg-surface
          shadow-sm
        "
      >
        <div
          className="
            flex items-center
            justify-between
            gap-4
            border-b border-line
            bg-[#faf7f1]
            px-5 py-4
          "
        >
          <p className="text-sm text-muted">
            {total} negocios
            {cargando && resultado
              ? " · Actualizando..."
              : ""}
          </p>

          <label className="flex items-center gap-2 text-sm text-muted">
            Filas por página

            <select
              value={filasPorPagina}
              onChange={(event) =>
                cambiarFilasPorPagina(
                  Number(
                    event.target.value,
                  ),
                )
              }
              className="
                rounded-lg
                border border-line
                bg-surface
                px-3 py-2
                text-sm text-foreground
                outline-none
                focus:border-accent
                focus:ring-2
                focus:ring-accent/20
              "
            >
              {FILAS_POR_PAGINA.map(
                (cantidad) => (
                  <option
                    key={cantidad}
                    value={cantidad}
                  >
                    {cantidad}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        {error && (
          <p className="px-5 py-4 text-sm text-muted">
            {error}
          </p>
        )}

        {!resultado &&
          cargando &&
          !error && (
            <p className="px-5 py-6 text-sm text-muted">
              Cargando negocios...
            </p>
          )}

        {resultado && !error && (
          <>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="bg-accent-soft/40 text-left">
                  <th className="w-[16%] px-3 py-4 text-xs font-semibold text-accent">
                    Negocio
                  </th>

                  <th className="w-[18%] px-3 py-4 text-xs font-semibold text-accent">
                    Ubicaciones
                  </th>

                  <th className="w-[20%] px-3 py-4 text-xs font-semibold text-accent">
                    Productos
                  </th>

                  <th className="w-[13%] px-3 py-4 text-xs font-semibold text-accent">
                    Contacto
                  </th>

                  <th className="w-[10%] px-3 py-4 text-xs font-semibold text-accent">
                    Orgánicos
                  </th>

                  <th className="w-[12%] px-3 py-4 text-xs font-semibold text-accent">
                    Modalidades
                  </th>

                  <th className="w-[11%] px-3 py-4 text-xs font-semibold text-accent">
                    Enlaces
                  </th>
                </tr>
              </thead>

              <tbody>
                {resultado.negocios.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-muted"
                    >
                      No hay negocios para la búsqueda seleccionada.
                    </td>
                  </tr>
                ) : (
                  resultado.negocios.map(
                    (negocio) => (
                      <tr
                        key={negocio.id}
                        className="
                          align-top
                          border-t border-line
                          transition
                          hover:bg-[#faf7f1]/70
                        "
                      >
                        <td className="break-words px-3 py-5">
                          <NombreNegocio
                            negocio={negocio}
                          />
                        </td>

                        <td className="break-words px-3 py-5">
                          <UbicacionesNegocio
                            negocio={negocio}
                          />
                        </td>

                        <td className="break-words px-3 py-5">
                          <ProductosNegocio
                            negocio={negocio}
                          />
                        </td>

                        <td className="break-words px-3 py-5">
                          <ContactosNegocio
                            negocio={negocio}
                          />
                        </td>

                        <td className="break-words px-3 py-5 text-xs text-muted">
                          {textoOrganicos(
                            negocio.estadoProductosOrganicos,
                          )}
                        </td>

                        <td className="break-words px-3 py-5 text-xs text-muted">
                          {negocio.modalidadesVenta.length >
                          0
                            ? negocio.modalidadesVenta.join(
                                " · ",
                              )
                            : "No informado"}
                        </td>

                        <td className="break-words px-3 py-5">
                          <EnlacesNegocio
                            negocio={negocio}
                          />
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>

            {totalPaginas > 0 && (
              <div
                className="
                  flex items-center
                  justify-between
                  gap-4
                  border-t border-line
                  px-5 py-4
                "
              >
                <p className="text-xs text-muted">
                  Página {paginaActual} de{" "}
                  {totalPaginas}
                </p>

                <nav
                  aria-label="Paginación de negocios"
                  className="flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={mostrarAnterior}
                    disabled={
                      cargando ||
                      paginaActual <= 1
                    }
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>

                  {botonesPaginacion.map(
                    (item, index) => {
                      if (
                        item === "ellipsis"
                      ) {
                        return (
                          <span
                            key={`ellipsis-${index}`}
                            className="px-2 text-sm text-muted"
                          >
                            ...
                          </span>
                        );
                      }

                      const activaPagina =
                        item ===
                        paginaActual;

                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() =>
                            setPaginaActual(
                              item,
                            )
                          }
                          disabled={
                            cargando ||
                            activaPagina
                          }
                          aria-current={
                            activaPagina
                              ? "page"
                              : undefined
                          }
                          className={`
                            min-w-9
                            rounded-lg
                            border
                            px-3 py-2
                            text-sm
                            font-semibold
                            transition
                            disabled:cursor-not-allowed
                            ${
                              activaPagina
                                ? "border-accent bg-accent text-white"
                                : "border-line bg-surface text-muted hover:border-accent/40 hover:text-accent disabled:opacity-40"
                            }
                          `}
                        >
                          {item}
                        </button>
                      );
                    },
                  )}

                  <button
                    type="button"
                    onClick={mostrarSiguiente}
                    disabled={
                      cargando ||
                      paginaActual >=
                        totalPaginas
                    }
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
