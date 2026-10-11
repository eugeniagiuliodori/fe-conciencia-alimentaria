"use client";

import { PaisSelect } from "@/components/Ubicacion/Pais/PaisSelect";
import { DivisionSelect } from "@/components/Ubicacion/DivisionGeografica/DivisionSelect";
import { CiudadSelect } from "@/components/Ubicacion/Ciudad/CiudadSelect";

type UbicacionSelectorProps = {
  paisId: string;
  divisionId: string;
  ciudad: string;
  onPaisChange: (
    paisId: string,
  ) => void;
  onDivisionChange: (
    divisionId: string,
  ) => void;
  onCiudadChange: (
    ciudad: string,
  ) => void;
};

export function UbicacionSelector({
  paisId,
  divisionId,
  ciudad,
  /*onPaisChange,*/
  onDivisionChange,
  onCiudadChange,
}: UbicacionSelectorProps) {
  return (
    <section
      className="
        rounded-[1rem]
        border border-line
        bg-surface
        p-5
        shadow-sm
        md:p-6
        max-w-md
        lg:max-w-lg
        flex flex-col justify-center
      "
    >
      <div className="mb-5 space-y-1">
        <h2 className="font-display text-xl font-semibold text-accent">
          Ubicación
        </h2>

        <p className="text-sm text-muted">
          Localizá los negocios disponibles de tu interés
        </p>
      </div>

      <div className="flex gap-5 justify-between justify-center">
        {/*<PaisSelect
          value={paisId}
          onChange={onPaisChange}
        />*/}

        <DivisionSelect
          paisId={paisId}
          value={divisionId}
          onChange={onDivisionChange}
        />

        <CiudadSelect
          paisId={paisId}
          divisionId={divisionId}
          value={ciudad}
          onChange={onCiudadChange}
        />
      </div>
    </section>
  );
}
