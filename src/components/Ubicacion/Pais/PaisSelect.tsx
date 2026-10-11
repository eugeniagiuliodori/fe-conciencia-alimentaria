"use client";

import {
  useEffect,
  useState,
} from "react";

import { getPaises } from "@/lib/geografia";
import type { PaisGeografia } from "@/types/geografia";

type PaisSelectProps = {
  value: string;
  onChange: (paisId: string) => void;
};

export  function PaisSelect({
  value,
  onChange,
}: PaisSelectProps) {
  const [paises, setPaises] =
    useState<PaisGeografia[]>([]);

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarPaises() {
      setCargando(true);
      setError(null);

      try {
        const datos = await getPaises();

        if (!cancelado) {
          setPaises(datos);
        }
      } catch {
        if (!cancelado) {
          setPaises([]);
          setError(
            "No se pudieron cargar los países.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarPaises();

    return () => {
      cancelado = true;
    };
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
        disabled={cargando || !!error}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="
          w-full
          rounded-[1rem]
          border border-line
          bg-surface
          px-4 py-3
          text-sm text-foreground
          outline-none
          transition
          focus:border-accent
          focus:ring-2
          focus:ring-accent/20
          disabled:cursor-not-allowed
          disabled:opacity-60
        "
      >
        <option value="">
          {cargando
            ? "Cargando países..."
            : error
              ? "No se pudieron cargar los países"
              : "Seleccioná un país"}
        </option>

        {paises.map((pais) => (
          <option
            key={pais.id}
            value={pais.id}
          >
            {pais.nombre}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-sm text-muted">
          {error}
        </p>
      )}
    </div>
  );
}