"use client";

import {
  useEffect,
  useState,
} from "react";

import { getCiudades } from "@/lib/geografia";

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
  const [ciudades, setCiudades] =
    useState<string[]>([]);

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!paisId || !divisionId) {
      setCiudades([]);
      setCargando(false);
      setError(null);
      return;
    }

    let cancelado = false;

    async function cargarCiudades() {
      setCargando(true);
      setError(null);

      try {
        const datos =
          await getCiudades(
            paisId,
            divisionId,
          );

        if (!cancelado) {
          setCiudades(datos);
        }
      } catch {
        if (!cancelado) {
          setCiudades([]);
          setError(
            "No se pudieron cargar las ciudades.",
          );
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    void cargarCiudades();

    return () => {
      cancelado = true;
    };
  }, [
    paisId,
    divisionId,
  ]);

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
          {!paisId
            ? "Primero seleccioná un país"
            : !divisionId
              ? "Primero seleccioná una división"
              : cargando
                ? "Cargando ciudades..."
                : error
                  ? "No se pudieron cargar las ciudades"
                  : "Seleccioná una ciudad"}
        </option>

        {ciudades.map((ciudad) => (
          <option
            key={ciudad}
            value={ciudad}
          >
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