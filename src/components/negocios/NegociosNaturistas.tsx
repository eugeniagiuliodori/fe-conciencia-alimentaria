"use client";

import {
  useEffect,
  useState,
} from "react";

import { getNegocios } from "@/lib/negocios";
import type {
  NegocioPublico,
} from "@/types/negocios";
import { NegociosSlider } from "./components/NegociosSlider";
import { NegociosTable } from "./components/NegociosTable";
import { ButtonAddNegocio } from "./components/ButtonAddNegocio";





export function NegociosNaturistas() {
  const [negocios, setNegocios] =
    useState<NegocioPublico[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);


  

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setError(null);

      try {
        const datos =
          await getNegocios();

        if (!cancelado) {
          setNegocios(datos);
        }
      } catch {
        if (!cancelado) {
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
  }, []);


  if (cargando) {
    return (
      <section
        className="
          rounded-[1.5rem]
          border border-line
          bg-surface
          p-6
          text-sm text-muted
          shadow-sm
        "
      >
        Cargando negocios naturistas...
      </section>
    );
  }

  if (error) {
    return (
      <section
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
      </section>
    );
  }

  if (negocios.length === 0) {
    return (
      <section
        className="
          rounded-[1.5rem]
          border border-line
          bg-surface
          p-6
          text-sm text-muted
          shadow-sm
        "
      >
        No hay negocios naturistas
        disponibles.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="w-full">
        <div className="flex flex-col items-center justify-center pb-[1rem] border-none max-w-full md:max-w-[35rem]">
        <p className="pb-[1rem] text-xs text-center font-semibold tracking-[0.16em] text-accent uppercase">
          Guía de comercios
        </p>
        <div className="flex flex-col items-center justify-center p-[1rem] bg-[#EEF0DC]/80 rounded-[2rem]  max-w-full">
        <h2 className="font-display text-2xl text-foreground sm:text-3xl ">
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
          <ButtonAddNegocio/>
        </div>
      <NegociosSlider negocios={negocios}/>
      <NegociosTable negocios={negocios}/>
    </section>
  );
}