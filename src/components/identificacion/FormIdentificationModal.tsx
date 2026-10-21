"use client";

import { useEffect, useState } from "react";
import { FormIdentificacion } from "../formularios/FormIdentificacion";
import { SessionModal } from "./SessionModal";

type IdentificationModalProps = {
  open: boolean;
  onClose: () => void;

};



export function FormIdentificationModal({
  open,
  onClose,
}: IdentificationModalProps) {
  
  const [openSession, setOpenSession] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

  


    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
          onClose();
        }
      }}
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-[#211827]/45
        px-4 py-6
        backdrop-blur-[5px]
        sm:px-6
      "
    >
     {openSession ? (
  <div className="relative w-full max-w-[650px]">
    <button
      type="button"
      onClick={() => setOpenSession(false)}
      aria-label="Volver al formulario"
      className="
        absolute right-3 top-3 z-10
        flex h-10 w-10
        items-center justify-center
        rounded-full
        bg-white/90
        text-xl text-accent
        shadow-md
        transition-colors
        hover:bg-white
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-accent
        cursor-pointer
      "
    >
      ×
    </button>

    <SessionModal />
  </div>
) : (
  
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mensaje-del-dia-title"
        className="
          relative w-full max-w-xl
          overflow-hidden
          rounded-[1.75rem]
          border border-[#d8b98a]/70
          bg-[linear-gradient(145deg,#fffdf8_0%,#faf4eb_45%,#f5edf5_100%)]
          shadow-[0_28px_80px_rgba(43,36,49,0.34)]
          max-h-[35rem]
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

        <div className="relative px-6 py-7 sm:px-9 sm:py-0">
          <button
            type="button"
            onClick={onClose}
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

         

         <section
        id="identificacion"
        aria-labelledby="identificacion-title"
        className="site-container border-t border-line py-6"
      >
        <FormIdentificacion />
        
          <section className="mt-6 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-accent/80">
              Si ya te identificaste, iniciá tu sesión
            </p>
            <p className="text-sm text-accent/80">
              {"<<"} Para mantener tu sesión iniciada, Conciencia Alimentaria utiliza una cookie 
              funcional. Si tu navegador bloquea las cookies, esta funcionalidad puede no 
              estar disponible.  {">>"} 
            </p>
            <button
              type="button"
              onClick={() => {setOpenSession(true)}}
              className="
                group inline-flex items-center justify-center gap-3
                rounded-xl
                border border-[#bba3c5]/50
                bg-[#f0e8f2]
                px-6 py-3
                text-sm font-semibold
                text-accent
                shadow-[0_4px_14px_rgba(105,66,115,0.10)]
                transition-all duration-300
                hover:-translate-y-0.5
                hover:border-[#9875a7]
                hover:bg-[#e7daec]
                hover:shadow-[0_8px_22px_rgba(105,66,115,0.18)]
                active:translate-y-0
                focus-visible:outline-none
                focus-visible:ring-2
                focus-visible:ring-accent/40
                cursor-pointer
              "
            >
              <span>Iniciar sesión</span>

              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-1"
              >
                →
              </span>
            </button>
          
          </section>
        
      </section>  
       <section className="mb-6 flex flex-col items-center justify-center gap-3 text-center"> 
          <div className=" flex justify-center">
            <button
              type="button"
              onClick={onClose}
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
          </section>
        </div>
      </div>
      )}
    </div>




  
      
  );
}