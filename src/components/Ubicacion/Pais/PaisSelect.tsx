"use client";

import { useEffect, useState } from "react";
import { getPaises } from "@/lib/geografia";
import type { PaisIndice } from "@/types/geografia";

type PaisSelectProps = {
  value: string;
  onChange: (paisId: string) => void;
};

export  function PaisSelect({
  value,
  onChange,
}: PaisSelectProps) {
  const [paises, setPaises] = useState<PaisIndice[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargarPaises() {
      try {
        const datos = await getPaises();
        setPaises(datos.paises);
      } finally {
        setCargando(false);
      }
    }

    void cargarPaises();
  }, []);

  return (
    <div className="space-y-2">
      <label
        htmlFor="pais"
        className="block text-sm font-semibold text-foreground"
      >
        País
      </label>

      <select
        id="pais"
        value={value}
        disabled={cargando}
        onChange={(event) => onChange(event.target.value)}
        className="
          w-full rounded-[1rem] border border-line
          bg-surface px-4 py-3
          text-sm text-foreground
          outline-none transition
          focus:border-accent focus:ring-2 focus:ring-accent/20
          disabled:cursor-not-allowed disabled:opacity-60
        "
      >
        <option value="">
          {cargando ? "Cargando países..." : "Seleccioná un país"}
        </option>

        {paises.map((pais) => (
          <option key={pais.id} value={pais.id}>
            {pais.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}