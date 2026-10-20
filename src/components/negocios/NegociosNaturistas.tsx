"use client";

import { useState } from "react";

import { UbicacionSelector } from "@/components/Ubicacion/UbicacionSelector";
import type { FiltrosNegocios } from "@/types/negocios";

import { ButtonAddNegocio } from "./components/ButtonAddNegocio";
import { NegociosSlider } from "./components/NegociosSlider";
import { NegociosTable } from "./components/NegociosTable";

const PAIS_ID = "argentina";

export function NegociosNaturistas() {
  const [divisionId, setDivisionId] =
    useState("");

  const [ciudad, setCiudad] =
    useState("");

  const filtrosNegocios: FiltrosNegocios = {
    divisionId:
      divisionId || undefined,
    ciudad:
      ciudad || undefined,
  };

  function handlePaisChange() {
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

      <NegociosSlider
        filtros={filtrosNegocios}
      />

      <NegociosTable
        filtros={filtrosNegocios}
      />
    </section>
  );
}
