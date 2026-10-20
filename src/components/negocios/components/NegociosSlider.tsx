"use client";

import {
  useEffect,
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

import { ContactosNegocio } from "./ContactoNegocio";
import { EnlacesNegocio } from "./EnlacesNegocio";
import { NombreNegocio } from "./NombreNegocio";
import { ProductosNegocio } from "./ProductoNegocio";
import { UbicacionesNegocio } from "./UbicacionesNegocio";

export function NegociosSlider({
  filtros,
}: {
  filtros: FiltrosNegocios;
}) {
  const [
    indiceSlider,
    setIndiceSlider,
  ] = useState(0);

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

  const [activo, setActivo] =
    useState(false);

  const claveFiltros = [
    filtros.divisionId ?? "",
    filtros.ciudad ?? "",
    filtros.estadoProductosOrganicos ??
      "",
  ].join("|");

  const claveFiltrosAnterior =
    useRef(claveFiltros);

  // Evita que slider y tabla consulten al BFF al mismo tiempo.
  // Coincide con el breakpoint xl usado en la UI.
  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 1280px)",
    );

    const actualizar = () => {
      setActivo(!media.matches);
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
    if (!activo) {
      return;
    }

    /*
     * Una búsqueda nueva comienza nuevamente por
     * el primer negocio del resultado filtrado.
     */
    if (
      claveFiltrosAnterior.current !==
      claveFiltros
    ) {
      claveFiltrosAnterior.current =
        claveFiltros;

      if (indiceSlider !== 0) {
        setIndiceSlider(0);
        return;
      }
    }

    let cancelado = false;

    async function cargarNegocio() {
      setCargando(true);
      setError(null);

      try {
        const datos =
          await getRangoNegocios({
            divisionId: filtros.divisionId,
            ciudad: filtros.ciudad,
            estadoProductosOrganicos:
              filtros.estadoProductosOrganicos,
            offset: indiceSlider,
            limit: 1,
          });

        if (cancelado) {
          return;
        }

        /*
         * Si el dataset cambió y el índice quedó fuera del
         * rango válido, nos reposicionamos en el último.
         */
        if (
          datos.total > 0 &&
          datos.negocios.length === 0 &&
          indiceSlider >= datos.total
        ) {
          setIndiceSlider(
            datos.total - 1,
          );
          return;
        }

        setResultado(datos);
      } catch {
        if (!cancelado) {
          setError(
            "No se pudo cargar el negocio.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarNegocio();

    return () => {
      cancelado = true;
    };
  }, [
    activo,
    claveFiltros,
    filtros.divisionId,
    filtros.ciudad,
    filtros.estadoProductosOrganicos,
    indiceSlider,
  ]);

  const negocioSlider =
    resultado?.negocios[0] ?? null;

  const total =
    resultado?.total ?? 0;

  const posicionActual =
    total > 0
      ? indiceSlider + 1
      : 0;

  function mostrarAnterior() {
    if (total <= 1) {
      return;
    }

    setIndiceSlider(
      (actual) =>
        actual === 0
          ? total - 1
          : actual - 1,
    );
  }

  function mostrarSiguiente() {
    if (total <= 1) {
      return;
    }

    setIndiceSlider(
      (actual) =>
        actual === total - 1
          ? 0
          : actual + 1,
    );
  }

  // SLIDER: pantallas menores a xl.
  return (
    <div className="xl:hidden">
      {error && (
        <div className="rounded-[1.5rem] border border-line bg-surface p-5 text-sm text-muted shadow-sm">
          {error}
        </div>
      )}

      {!resultado &&
        cargando &&
        !error && (
          <div className="rounded-[1.5rem] border border-line bg-surface p-5 text-sm text-muted shadow-sm">
            Cargando negocio...
          </div>
        )}

      {resultado &&
        total === 0 &&
        !error && (
          <div className="rounded-[1.5rem] border border-line bg-surface p-5 text-sm text-muted shadow-sm">
            No hay negocios para la búsqueda seleccionada.
          </div>
        )}

      {negocioSlider && !error && (
        <article
          className="
            relative
            overflow-hidden
            rounded-[1.75rem]
            border border-[#d8b98a]
            bg-[linear-gradient(145deg,#fffaf2_0%,#faf8f5_52%,#f4edf5_100%)]
            p-5
            shadow-[0_12px_32px_rgba(105,66,115,0.14)]
            sm:p-6
          "
        >
          <div className="space-y-6">
            <NombreNegocio
              negocio={negocioSlider}
            />

            <div>
              <h3 className="mb-2 text-sm font-semibold text-accent">
                Ubicaciones
              </h3>

              <UbicacionesNegocio
                negocio={negocioSlider}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-accent">
                Productos
              </h3>

              <ProductosNegocio
                negocio={negocioSlider}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-accent">
                Contacto
              </h3>

              <ContactosNegocio
                negocio={negocioSlider}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-accent">
                  Productos orgánicos
                </h3>

                <p className="text-sm text-muted">
                  {textoOrganicos(
                    negocioSlider.estadoProductosOrganicos,
                  )}
                </p>
              </div>

              <div>
                <h3 className="mb-1 text-sm font-semibold text-accent">
                  Modalidades
                </h3>

                <p className="text-sm text-muted">
                  {negocioSlider.modalidadesVenta.length >
                  0
                    ? negocioSlider.modalidadesVenta.join(
                        " · ",
                      )
                    : "No informado"}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-accent">
                Enlaces
              </h3>

              <EnlacesNegocio
                negocio={negocioSlider}
              />
            </div>
          </div>

          <div
            className="
              mt-7 flex
              items-center
              justify-between
              border-t border-line
              pt-5
            "
          >
            <button
              type="button"
              onClick={mostrarAnterior}
              disabled={
                cargando || total <= 1
              }
              aria-label="Mostrar negocio anterior"
              className="
                inline-flex h-10 w-10
                items-center justify-center
                rounded-full
                border border-[#d8b98a]
                bg-white/70
                text-lg text-accent
                transition
                hover:bg-accent-soft
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              ←
            </button>

            <p
              aria-live="polite"
              className="text-xs font-semibold text-muted"
            >
              {posicionActual} / {total}
              {cargando
                ? " · Cargando..."
                : ""}
            </p>

            <button
              type="button"
              onClick={mostrarSiguiente}
              disabled={
                cargando || total <= 1
              }
              aria-label="Mostrar siguiente negocio"
              className="
                inline-flex h-10 w-10
                items-center justify-center
                rounded-full
                border border-[#d8b98a]
                bg-white/70
                text-lg text-accent
                transition
                hover:bg-accent-soft
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              →
            </button>
          </div>
        </article>
      )}
    </div>
  );
}
