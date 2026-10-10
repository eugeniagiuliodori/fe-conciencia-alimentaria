"use client";

import { useEffect, useMemo, useState } from "react";
import { getPais } from "@/lib/geografia";
import type { GeografiaPais } from "@/types/geografia";

type CiudadSelectProps = {
  paisId: string;
  divisionId: string;
  value: string;
  onChange: (ciudad: string) => void;
};

export  function CiudadSelect({
  paisId,
  divisionId,
  value,
  onChange,
}: CiudadSelectProps) {
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
          setError("No se pudieron cargar las ciudades.");
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

  const ciudades = useMemo(() => {
    if (!divisionId) {
      return [];
    }

    return (
      pais?.divisiones.find(
        (division) => division.id === divisionId,
      )?.ciudades ?? []
    );
  }, [pais, divisionId]);

  return (
    <div className="space-y-2">
      <label
        htmlFor="ciudad"
        className="block text-sm font-semibold text-foreground"
      >
        Ciudad
      </label>

      <select
        id="ciudad"
        value={value}
        disabled={
          !paisId ||
          !divisionId ||
          cargando ||
          !!error
        }
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
              ? "Cargando datos..."
              : !divisionId
                ? "Primero seleccioná una división"
                : error
                  ? "No se pudieron cargar las ciudades"
                  : "Seleccioná una ciudad"}
        </option>

        {ciudades.map((ciudad) => (
          <option key={ciudad} value={ciudad}>
            {ciudad}
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