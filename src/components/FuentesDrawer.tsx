
"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  obtenerMesActual,
  obtenerFuentesPorMes,
} from "@/lib/dates";

export function FuentesDrawer() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fuentes, setFuentes] = useState<string[]>([]);
  const [mesConsultado, setMesConsultado] = useState("");

  // Impide desplazar la página mientras el modal está abierto.
  useEffect(() => {
    if (!abierto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [abierto]);

  async function abrirDrawer() {
    const dialog = dialogRef.current;

    if (!dialog || dialog.open) return;

    // Apertura modal nativa.
    dialog.showModal();
    setAbierto(true);

    // Evitamos volver a consultar el archivo si ya se cargó.
    if (cargado || cargando) return;

    setCargando(true);
    setError(null);

    const mes = obtenerMesActual();
    setMesConsultado(mes);

    try {
      const resultado = await obtenerFuentesPorMes(mes);

      setFuentes(resultado);
      setCargado(true);
    } catch (error) {
      console.error("Error cargando fuentes:", error);
      setError("No se pudieron recuperar las fuentes científicas.");
    } finally {
      setCargando(false);
    }
  }

  function cerrarDrawer() {
    dialogRef.current?.close();
  }

  return (
    <>
      {/* DISPARADOR: al final de la página */}

      <section className="mx-auto mt-12 w-full max-w-4xl px-4 pb-10 text-center">

        <div className="mx-auto mb-5 h-px w-24 bg-[#D8D0BE]" />

        <p className="mb-3 text-sm font-medium text-[#6F745E]">
          Fuentes científicas del mes
        </p>

        <button
          type="button"
          onClick={() => void abrirDrawer()}
          aria-label="Desplegar fuentes científicas"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          className="
            mx-auto flex h-12 w-12 items-center justify-center
            rounded-full border border-[#49633B]
            bg-[#49633B] text-white shadow-md
            transition-all duration-200
            hover:-translate-y-1 hover:bg-[#354B2B]
            hover:shadow-lg
            focus-visible:outline-2
            focus-visible:outline-offset-4
            focus-visible:outline-[#49633B]
          "
        >
          {/* Flecha hacia arriba */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </button>

      </section>

      {/* MODAL BOTTOM DRAWER */}

      <dialog
        ref={dialogRef}
        aria-labelledby={tituloId}
        onClose={() => setAbierto(false)}
        className="
          fixed inset-x-0 bottom-0 top-auto
          m-0 w-full max-w-none
          overflow-hidden
          rounded-t-[28px]
          border border-[#D8D0BE]
          bg-[#FAF9F3] p-0
          text-[#354B2B]
          shadow-2xl
          backdrop:bg-[#192718]/60
          sm:mx-auto sm:max-w-3xl
        "
      >
        <div className="flex max-h-[85dvh] flex-col">

          {/* Cabecera fija dentro del drawer */}

          <header className="shrink-0 border-b border-[#D8D0BE] bg-[#EEF0DC] px-5 pb-5 pt-3">

            {/* Flecha hacia abajo: cierre explícito */}
            <button
              type="button"
              onClick={cerrarDrawer}
              aria-label="Cerrar fuentes científicas"
              className="
                mx-auto flex h-10 w-10 items-center justify-center
                rounded-full bg-[#49633B] text-white
                transition-colors hover:bg-[#354B2B]
                focus-visible:outline-2
                focus-visible:outline-offset-2
                focus-visible:outline-[#49633B]
              "
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            <h2
              id={tituloId}
              className="font-display mt-4 text-center text-2xl text-[#354B2B] sm:text-3xl"
            >
              Fuentes científicas
            </h2>

            <p className="mt-2 text-center text-sm text-[#6F745E]">
              Publicaciones que nutren nuestro conocimiento
              {mesConsultado && ` · ${mesConsultado}`}
            </p>

          </header>

          {/* Zona desplazable: enlaces */}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-8">

            {cargando && (
              <p role="status" className="py-8 text-center text-[#6F745E]">
                Cargando fuentes científicas...
              </p>
            )}

            {error && (
              <p role="alert" className="py-8 text-center text-[#8A443A]">
                {error}
              </p>
            )}

            {!cargando && !error && cargado && fuentes.length === 0 && (
              <p className="py-8 text-center text-[#6F745E]">
                Todavía no hay fuentes registradas para este mes.
              </p>
            )}

            {!cargando && !error && fuentes.length > 0 && (
              <ul className="flex flex-col gap-4">

                {fuentes.map((url, index) => (
                  <li key={`${index}-${url}`}>

                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        group block min-w-0 rounded-2xl
                        border border-[#D8D0BE]
                        bg-[#EEF0DC]/60 p-5 shadow-sm
                        transition-all duration-200
                        hover:border-[#8C9C78]
                        hover:bg-[#EEF0DC]
                        hover:shadow-md
                        focus-visible:outline-2
                        focus-visible:outline-offset-2
                        focus-visible:outline-[#49633B]
                      "
                    >
                      <div className="flex items-center justify-between gap-3">

                        <span className="text-xs font-semibold uppercase tracking-widest text-[#6F745E]">
                          Fuente científica · {String(index + 1).padStart(2, "0")}
                        </span>

                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#49633B] text-white group-hover:bg-[#354B2B]"
                        >
                          ↗
                        </span>

                      </div>

                      <p className="mt-4 min-w-0 text-sm leading-relaxed text-[#354B2B] [overflow-wrap:anywhere] sm:text-base">
                        {url}
                      </p>

                      <p className="mt-4 text-xs font-medium text-[#6F745E]">
                        Consultar publicación original
                      </p>

                    </a>

                  </li>
                ))}

              </ul>
            )}

          </div>

          {/* Pie del modal */}

          <footer className="shrink-0 border-t border-[#D8D0BE] bg-[#FAF9F3] px-4 py-4 text-center">
            <p className="text-xs tracking-wide text-[#6F745E]">
              CONCIENCIA ALIMENTARIA · EL CONOCIMIENTO TAMBIÉN NUTRE
            </p>
          </footer>

        </div>
      </dialog>
    </>
  );
}
