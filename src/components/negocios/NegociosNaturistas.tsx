"use client";

import {
  useEffect,
  useState,
} from "react";

import { getNegocios } from "@/lib/negocios";
import type {
  NegocioPublico,
} from "@/types/negocios";
import { UbicacionSelector } from "@/components/Ubicacion/UbicacionSelector";

import { NegociosSlider } from "./components/NegociosSlider";
import { NegociosTable } from "./components/NegociosTable";
import { ButtonAddNegocio } from "./components/ButtonAddNegocio";

export function NegociosNaturistas() {
  const [paisId, setPaisId] =
    useState("argentina");

  const [divisionId, setDivisionId] =
    useState("");

  const [ciudad, setCiudad] =
    useState("");

  const [negocios, setNegocios] =
    useState<NegocioPublico[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const PAIS_ID = "argentina";

  function handlePaisChange(
    nuevoPaisId: string,
  ) {
    setPaisId(nuevoPaisId);

    // Al cambiar el país, las selecciones dependientes
    // dejan de ser válidas.
    setDivisionId("");
    setCiudad("");
  }

  function handleDivisionChange(
    nuevaDivisionId: string,
  ) {
    setDivisionId(nuevaDivisionId);

    // Al cambiar la división, la ciudad seleccionada
    // deja de ser válida.
    setCiudad("");
  }

  function handleCiudadChange(
    nuevaCiudad: string,
  ) {
    setCiudad(nuevaCiudad);
  }

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      /*
       * El directorio de negocios contiene actualmente
       * información de Argentina.
       *
       * La geografía es reutilizable para otros países,
       * pero no debemos mostrar negocios argentinos si
       * el usuario selecciona otro país.
       */
      if (paisId && paisId !== "argentina") {
        setNegocios([]);
        setError(null);
        setCargando(false);
        return;
      }

      setCargando(true);
      setError(null);

      try {
        const datos =
          await getNegocios({
            divisionId:
              divisionId || undefined,
            ciudad:
              ciudad || undefined,
          });
        if (!cancelado) {
          setNegocios(datos);
        }
      } catch {
        if (!cancelado) {
          setNegocios([]);
          setError(
            "No se pudieron cargar los negocios naturistas.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargar();

    return () => {
      cancelado = true;
    };
  }, [
    paisId,
    divisionId,
    ciudad,
  ]);

  return (
    <section className="space-y-6 lg:flex lg:flex-col lg:items-center">
      <div className="w-full">
        <div className="flex max-w-full flex-col items-center justify-center border-none pb-[1rem] md:max-w-[35rem]">
          <p className="pb-[1rem] text-center text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            Guía de comercios
          </p>

          <div className="flex max-w-full flex-col items-center justify-center rounded-[2rem] bg-[#EEF0DC]/80 p-[1rem]">
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">
              Negocios naturistas
            </h2>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
              Información sobre comercios
              vinculados con alimentación
              natural y consciente.
            </p>
          </div>
        </div>
      </div>

      <div className="flex w-full justify-end">
        <ButtonAddNegocio />
      </div>

      <UbicacionSelector
        paisId={PAIS_ID}
        divisionId={divisionId}
        ciudad={ciudad}
        onPaisChange={handlePaisChange}
        onDivisionChange={
          handleDivisionChange
        }
        onCiudadChange={
          handleCiudadChange
        }
      />

      {cargando && (
        <div
          className="
            rounded-[1.5rem]
            border border-line
            bg-surface
            p-6
            text-sm text-muted
            shadow-sm
          "
        >
          Buscando negocios naturistas...
        </div>
      )}

      {!cargando && error && (
        <div
          className="
            rounded-[1.5rem]
            border border-line
            bg-surface
            p-6
            text-sm text-muted
            shadow-sm
          "
        >
          {error}
        </div>
      )}

      {!cargando &&
        !error &&
        negocios.length === 0 && (
          <div
            className="
              rounded-[1.5rem]
              border border-line
              bg-surface
              p-6
              text-sm text-muted
              shadow-sm
            "
          >
            {paisId &&
            paisId !== "argentina"
              ? "Por el momento, el directorio de negocios naturistas está disponible para Argentina."
              : "No hay negocios naturistas para la búsqueda seleccionada."}
          </div>
        )}

      {!cargando &&
        !error &&
        negocios.length > 0 && (
          <>
            <NegociosSlider
              negocios={negocios}
            />

            <NegociosTable
              negocios={negocios}
            />
          </>
        )}
    </section>
  );
}
