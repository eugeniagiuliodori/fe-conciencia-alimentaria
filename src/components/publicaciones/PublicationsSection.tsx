"use client";

import {
  useEffect,
  useState,
} from "react";

import { PublicationCard } from "@/components/publicaciones/components/PublicationCard";
import {
  getRangoPublicaciones,
} from "@/lib/publicaciones";
import type {
  ResultadoRangoPublicaciones,
} from "@/types/publicaciones";

import { ConstruirPaginacion } from "@/components/publicaciones/components/ConstruirPaginacion";
import { usePaginacionGrid } from "@/components/publicaciones/components/usePaginacionGrid";

export function PublicationsSection() {
  const [
    resultado,
    setResultado,
  ] =
    useState<ResultadoRangoPublicaciones | null>(
      null,
    );

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const totalItems =
    resultado?.total ?? 0;

  const {
    currentPage,
    rowsPerPage,
    totalPages,
    paginationItems,
    rango,
    responsiveReady,
    setCurrentPage,
    cambiarFilasPorPagina,
    mostrarAnterior,
    mostrarSiguiente,
  } = usePaginacionGrid({
    totalItems,
  });

  useEffect(() => {
    if (!responsiveReady) {
      return;
    }

    let cancelado = false;

    async function cargarRango() {
      setCargando(true);
      setError(null);

      try {
        const datos =
          await getRangoPublicaciones(
            rango,
          );

        if (cancelado) {
          return;
        }

        /*
         * Si la colección cambió y el offset quedó fuera
         * del rango disponible, la actualización de total
         * hará que usePaginacionGrid reajuste currentPage.
         */
        setResultado(datos);
      } catch {
        if (!cancelado) {
          setError(
            "No se pudieron cargar las publicaciones.",
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
    responsiveReady,
    rango,
  ]);

  const publicacionesVisibles =
    resultado?.publicaciones ?? [];

  return (
    <section
      id="publicaciones"
      aria-labelledby="publications-title"
      className="site-container border-t border-line py-12 sm:py-16"
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <h2
          id="publications-title"
          className="font-display text-3xl sm:text-4xl"
        >
          Publicaciones
        </h2>

        <div className="flex items-center gap-2 text-sm text-[#6F745E]">
          <label htmlFor="rows-per-page">
            Filas por página
          </label>

          <select
            id="rows-per-page"
            value={rowsPerPage}
            onChange={(event) =>
              cambiarFilasPorPagina(
                Number(
                  event.target.value,
                ),
              )
            }
            disabled={cargando}
            className="rounded-lg border border-[#D8D0BE] bg-surface px-3 py-2 text-[#49633B] outline-none focus:ring-2 focus:ring-[#49633B]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
      </div>

      {!resultado &&
        cargando &&
        !error && (
          <div className="rounded-[1.5rem] border border-line bg-surface p-6 text-sm text-muted shadow-sm">
            Cargando publicaciones...
          </div>
        )}

      {error && (
        <div className="rounded-[1.5rem] border border-line bg-surface p-6 text-sm text-muted shadow-sm">
          {error}
        </div>
      )}

      {resultado &&
        !error &&
        resultado.total === 0 && (
          <div className="rounded-[1.5rem] border border-line bg-surface p-6 text-sm text-muted shadow-sm">
            No hay publicaciones disponibles.
          </div>
        )}

      {resultado &&
        !error &&
        resultado.total > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {publicacionesVisibles.map(
                (publication) => (
                  <PublicationCard
                    key={
                      publication.slug
                    }
                    publication={
                      publication
                    }
                  />
                ),
              )}
            </div>

            <ConstruirPaginacion
              currentPage={
                currentPage
              }
              totalPages={
                totalPages
              }
              paginationItems={
                paginationItems
              }
              cargando={cargando}
              onPageChange={
                setCurrentPage
              }
              onAnterior={
                mostrarAnterior
              }
              onSiguiente={
                mostrarSiguiente
              }
            />
          </>
        )}
    </section>
  );
}
