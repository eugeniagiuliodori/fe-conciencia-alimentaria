"use client";

import { useState } from "react";

import {PaisSelect} from "@/components/Ubicacion/Pais/PaisSelect";
import {DivisionSelect} from "@/components/Ubicacion/DivisionGeografica/DivisionSelect";
import {CiudadSelect} from "@/components/Ubicacion/Ciudad/CiudadSelect";

export function UbicacionSelector() {
  const [paisId, setPaisId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [ciudad, setCiudad] = useState("");

  function handlePaisChange(nuevoPaisId: string) {
    setPaisId(nuevoPaisId);

    // Al cambiar el país, las selecciones dependientes
    // dejan de ser válidas.
    setDivisionId("");
    setCiudad("");
  }

  function handleDivisionChange(nuevaDivisionId: string) {
    setDivisionId(nuevaDivisionId);

    // Al cambiar la división, la ciudad seleccionada
    // deja de ser válida.
    setCiudad("");
  }

  function handleCiudadChange(nuevaCiudad: string) {
    setCiudad(nuevaCiudad);
  }

  return (
    <section
      className="
        rounded-[1rem]
        border border-line
        bg-surface
        p-5
        shadow-sm
        md:p-6
      "
    >
      <div className="mb-5 space-y-1">
        <h2 className="font-display text-xl font-semibold text-accent">
          Ubicación
        </h2>

        <p className="text-sm text-muted">
          Seleccioná el país, la división administrativa y la ciudad.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <PaisSelect
          value={paisId}
          onChange={handlePaisChange}
        />

        <DivisionSelect
          paisId={paisId}
          value={divisionId}
          onChange={handleDivisionChange}
        />

        <CiudadSelect
          paisId={paisId}
          divisionId={divisionId}
          value={ciudad}
          onChange={handleCiudadChange}
        />
      </div>
    </section>
  );
}