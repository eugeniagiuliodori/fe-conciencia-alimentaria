"use client";

import { useEffect, useState } from "react";
import { getPais } from "@/lib/geografia";
import type {
  DivisionAdministrativa,
  GeografiaPais,
} from "@/types/geografia";

type DivisionSelectProps = {
  paisId: string;
  value: string;
  onChange: (divisionId: string) => void;
};

export  function DivisionSelect({
  paisId,
  value,
  onChange,
}: DivisionSelectProps) {
  const [pais, setPais] = useState<GeografiaPais | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paisId) {
      setPais(null);
      setError(null);
      setCargando(false);
      return;
    }

    let cancelado = false;

    async function cargarPais() {
      setCargando(true);
      setError(null);

      try {
        const datos = await getPais(paisId);

        if (!cancelado) {
          setPais(datos);
        }
      } catch {
        if (!cancelado) {
          setPais(null);
          setError("No se pudieron cargar las divisiones.");
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarPais();

    return () => {
      cancelado = true;
    };
  }, [paisId]);

  const divisiones: DivisionAdministrativa[] =
    pais?.divisiones ?? [];

  return (
    <div className="space-y-2">
      <label
        htmlFor="division"
        className="block text-sm font-semibold text-foreground"
      >
        División administrativa
      </label>

      <select
        id="division"
        value={value}
        disabled={!paisId || cargando || !!error}
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
          {!paisId
            ? "Primero seleccioná un país"
            : cargando
              ? "Cargando divisiones..."
              : error
                ? "No se pudieron cargar las divisiones"
                : "Seleccioná una división"}
        </option>

        {divisiones.map((division) => (
          <option key={division.id} value={division.id}>
            {division.nombre}
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