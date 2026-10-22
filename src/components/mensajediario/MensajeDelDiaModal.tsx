"use client";

import { useEffect, useMemo, useState } from "react";
import frases from "@/data/frases-diarias.json";

const siteUrl = "https://fe-conciencia-alimentaria.vercel.app/";

type MensajeDelDiaModalProps = {
  open: boolean;
  onClose: () => void;
};

function obtenerIndiceDelDia(): number {
  const fecha = new Date();

  const inicioDelAnio = Date.UTC(
    fecha.getFullYear(),
    0,
    1,
  );

  const fechaActual = Date.UTC(
    fecha.getFullYear(),
    fecha.getMonth(),
    fecha.getDate(),
  );

  const milisegundosPorDia =
    1000 * 60 * 60 * 24;

  return Math.floor(
    (fechaActual - inicioDelAnio) /
      milisegundosPorDia,
  );
}


export function MensajeDelDiaModal({
  open,
  onClose,
}: MensajeDelDiaModalProps) {
  const [shareResult, setShareResult] = useState<"copied" | "unavailable" | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const frase = useMemo(() => {
    if (frases.length === 0) {
      return "Que hoy encuentres algo que haga bien a tu manera de estar en el mundo.";
    }

    return frases[obtenerIndiceDelDia()];
  }, []);

  const messageText = `“${frase}”\n\nConciencia Alimentaria`;
  const copyText = `${messageText}\n${siteUrl}`;

  function handleClose() {
    setShareResult(null);
    onClose();
  }

  async function handleShare() {
    setShareResult(null);

    if (typeof navigator.share === "function") {
      try {
        const contenido = `${messageText}\n\n${siteUrl}`;
        await navigator.share({
          text: contenido,
        });
      } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
          return;
        }
        setShareResult("unavailable");
      }
      return;
    }

    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(copyText);
        setShareResult("copied");
        return;
      }
    } catch {
      // La copia puede fallar por permisos o por el contexto del navegador.
    }

    setShareResult("unavailable");
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShareResult(null);
        onClose();
      }
    }

    const overflowAnterior = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = overflowAnterior;

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
      className="
        fixed inset-0 z-50
        flex items-start justify-center
        overflow-y-auto overscroll-contain
        bg-[#211827]/45
        px-4 py-6
        backdrop-blur-[5px]
        sm:px-6
      "
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mensaje-del-dia-title"
        className="
          relative my-auto w-full max-w-xl
          overflow-hidden
          rounded-[1.75rem]
          border border-[#d8b98a]/70
          bg-[linear-gradient(145deg,#fffdf8_0%,#faf4eb_45%,#f5edf5_100%)]
          shadow-[0_28px_80px_rgba(43,36,49,0.34)]
        "
      >
        {/* Luz cálida superior */}
        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute -top-24 left-1/2
            h-48 w-48
            -translate-x-1/2
            rounded-full
            bg-[#d8b98a]/20
            blur-3xl
          "
        />

        {/* Luz violeta inferior */}
        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute -right-20 -bottom-24
            h-52 w-52
            rounded-full
            bg-accent/10
            blur-3xl
          "
        />

        <div className="relative px-6 py-7 sm:px-9 sm:py-9">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar mensaje"
            className="
              absolute top-4 right-4
              flex h-9 w-9
              items-center justify-center
              rounded-full
              border border-line
              bg-white/60
              text-lg text-muted
              backdrop-blur-sm
              transition-all duration-300
              hover:scale-105
              hover:border-accent/30
              hover:bg-white
              hover:text-accent
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-accent/30
            "
          >
            ×
          </button>

          <div className="pr-9">
            <p
              className="
                mb-3
                text-xs font-semibold
                tracking-[0.18em]
                text-accent
                uppercase
              "
            >
              Conciencia Alimentaria
            </p>

            <h2
              id="mensaje-del-dia-title"
              className="
                font-display
                text-2xl leading-tight
                text-foreground
                sm:text-3xl
              "
            >
              Un mensaje para hoy
            </h2>
          </div>

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-[#d8b98a]/60" />

            <span
              aria-hidden="true"
              className="text-xl text-accent"
            >
              ✦
            </span>

            <span className="h-px flex-1 bg-[#d8b98a]/60" />
          </div>

          <blockquote
            className="
              mx-auto max-w-md
              text-center
              font-display
              text-xl leading-relaxed
              text-foreground
              sm:text-2xl
            "
          >
            “{frase}”
          </blockquote>

          <p
            className="
              mt-8
              text-center
              text-xs
              tracking-[0.08em]
              text-muted
            "
          >
            Una pequeña pausa dentro del día.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="
                min-h-11 rounded-full
                border border-accent/35
                bg-white/75
                px-5 py-2.5
                text-sm font-semibold
                text-accent
                shadow-[0_8px_24px_rgba(105,66,115,0.10)]
                transition-colors duration-200
                hover:bg-white
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-accent/30
              "
            >
              {canShare ? "Compartir mensaje" : "Copiar mensaje"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="
                rounded-full
                border border-accent/20
                bg-white/55
                px-5 py-2.5
                text-sm font-semibold
                text-accent
                shadow-[0_8px_24px_rgba(105,66,115,0.10)]
                backdrop-blur-sm
                transition-all duration-300
                hover:-translate-y-0.5
                hover:border-accent/35
                hover:bg-white/80
                hover:shadow-[0_12px_30px_rgba(105,66,115,0.16)]
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-accent/30
              "
            >
              Cerrar
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 text-center text-sm text-muted empty:mt-0">
            {shareResult === "copied"
              ? "Mensaje copiado"
              : shareResult === "unavailable"
                ? "No se pudo completar la acción. Podés seleccionar y copiar el mensaje:"
                : null}
          </p>
          {shareResult === "unavailable" && (
            <p className="mt-2 select-text whitespace-pre-wrap break-words rounded-xl bg-white/70 p-3 text-sm text-foreground">
              {copyText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
