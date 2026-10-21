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
        flex items-start justify-center sm:items-center
        min-h-0 overflow-y-auto overscroll-contain
        bg-[#221b2b]/55
        px-2 py-2
        backdrop-blur-[5px]
        sm:px-4 sm:py-2
      "
    >
     {openSession ? (
  <div className="relative my-auto w-full min-w-0 max-w-[650px]">
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
        text-xl text-[#692f49]
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
        aria-label="Identificación por correo electrónico"
        className="
          relative my-auto w-full min-w-0 max-w-2xl
          overflow-hidden
          rounded-[1.75rem]
          border border-[#cba96d]/85
          bg-[linear-gradient(135deg,#fffef9_0%,#fbf5e9_38%,#f3e9f3_76%,#edf4e6_100%)]
          shadow-[0_28px_80px_rgba(54,35,68,0.32),inset_0_0_0_1px_rgba(255,255,255,0.7)]
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
            bg-[#edcd83]/30
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
            bg-[#b69ad5]/20
            blur-3xl
          "
        />

        <div className="relative min-w-0 px-3 py-2 sm:px-5 sm:py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar mensaje"
            className="
              absolute top-2 right-2 z-10 
              flex h-8 w-8
              items-center justify-center
              rounded-full
              border border-[#d5b6c2]/80
              bg-[#fffaf8]/85
              text-lg text-[#7e4257]
              backdrop-blur-sm
              transition-all duration-300
              hover:scale-105
              hover:border-[#ab7894]
              hover:bg-[#fff7fb]
              hover:text-[#4c1d33]
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
        className="w-full min-w-0 pt-8 pb-1 sm:pt-7 sm:pb-1"
      >
        <FormIdentificacion />
        
          <section className="mt-2 flex flex-col items-center justify-center gap-1.5 text-center sm:mt-2">
            <p className="max-w-full break-words text-xs leading-snug font-medium text-[#75455d] sm:text-[13px]">
              Si ya te identificaste, iniciá tu sesión
            </p>
            <p className="max-w-full break-words text-xs leading-snug font-normal text-[#6d6570] sm:text-[13px]">
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
                border border-[#a98aa7]/75
                bg-[linear-gradient(135deg,#f4e4f0_0%,#e8d9ee_55%,#e7e9df_100%)]
                max-w-xs px-4 py-1.5
                text-sm w-auto sm:px-6 font-semibold
                text-[#673b63]
                shadow-[0_3px_12px_rgba(107,74,114,0.17),inset_0_1px_0_rgba(255,255,255,0.85)]
                transition-all duration-300
                hover:-translate-y-0.5
                hover:border-[#80638b]
                hover:bg-[linear-gradient(135deg,#ecdaed_0%,#daccdf_100%)]
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
       <section className="mb-0 mt-2 flex flex-col items-center justify-center gap-1 text-center"> 
          <div className=" flex justify-center">
            <button
              type="button"
              onClick={onClose}
              className="
                rounded-full
                border border-[#d6bd9c]/65
                bg-[linear-gradient(135deg,#fffdfa_0%,#f8efeb_100%)]
                px-5 py-1.5
                text-sm font-semibold
                text-[#79535d]
                shadow-[0_3px_10px_rgba(123,79,91,0.09)]
                backdrop-blur-sm
                transition-all duration-300
                hover:-translate-y-0.5
                hover:border-accent/35
                hover:bg-[#fff6ec]
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