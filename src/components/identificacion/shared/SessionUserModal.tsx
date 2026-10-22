"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { SubmissionResult } from "../solicitudes";


type IdentificationModalProps = {
  open: boolean;
  onClose: () => void;
};

interface ModalBaseProps {
  contenidoMsg: ReactElement;
  contenidoOp: ReactElement;
  onSubmit: (email: string) => Promise<SubmissionResult>;
}

type SessionUserModalProps =
  IdentificationModalProps & ModalBaseProps;

export function SessionUserModal({
  open,
  onClose,
  contenidoOp,
  contenidoMsg,
  onSubmit,
}: SessionUserModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<SubmissionResult | null>(null);
  const submitting = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) emailInput.current?.focus();
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const trimmedEmail = email.trim();
    if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(trimmedEmail)) {
      setFeedback({ ok: false, message: "Ingresá un correo electrónico válido." });
      return;
    }

    submitting.current = true;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      setFeedback(await onSubmit(trimmedEmail));
    } catch {
      setFeedback({ ok: false, message: "No se pudo confirmar la operación. Intentá nuevamente más tarde." });
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

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
      {contenidoMsg}  
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex flex-col lg:flex-row gap-2">
      <div className="flex w-full min-w-0 flex-col gap-0.5 lg:w-[35rem]">
          <label htmlFor="identificacion-email" className="text-sm font-medium text-[#704956]">
            Correo electrónico
          </label>
          <input
            ref={emailInput}
            id="identificacion-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFeedback(null);
            }}
            disabled={isSubmitting}
            aria-describedby="identificacion-aviso"
            className="min-h-10 min-w-0 w-full rounded-xl border border-[#d9c5d3] bg-white/90 px-3 py-2 text-base text-[#352d35] shadow-[inset_0_1px_3px_rgba(83,58,77,0.06)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#a47a9d] focus:shadow-[0_0_0_3px_rgba(164,122,157,0.16)]"
          />
      </div>

      <div className="flex w-full min-w-0 items-end justify-center lg:w-[18rem] lg:justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="primary-link !w-auto lg:w-full min-h-[2.5rem] max-h-[2.5rem]  min-w-0 whitespace-normal text-center !border-[#996c88] !bg-[linear-gradient(135deg,#814460_0%,#69405f_100%)] !text-[#fffaf7] !shadow-[0_4px_12px_rgba(102,56,83,0.24)] transition-[background,box-shadow,filter] duration-200 hover:!brightness-110 hover:!shadow-[0_6px_16px_rgba(102,56,83,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ab85a5] disabled:cursor-wait disabled:opacity-60 sm:w-auto;"
        >
          {isSubmitting ? "Enviando…" : "Enviar"}
        </button>
      </div>
      </div>
      <div aria-live="polite" role="status" className="min-h-5 text-sm text-[#704956]">
        {isSubmitting ? "Enviando solicitud…" : null}
      </div>
      {feedback && (
        !feedback.ok && feedback.message === "No se pudo confirmar la operación. Intentá nuevamente más tarde." ? (
          <div role="alert">
            <Image
              src="/images/proximo.png"
              alt="No se pudo confirmar la operación. Intentá nuevamente más tarde."
              width={1122}
              height={1402}
              sizes="(max-width: 640px) calc(100vw - 40px), 440px"
              className="mx-auto block h-auto max-h-[55dvh] w-auto max-w-full object-contain"
            />
          </div>
        ) : (
          <p role={feedback.ok ? "status" : "alert"} className="text-sm font-medium text-[#704956]">
            {feedback.message}
          </p>
        )
      )}
        </form>
      <fieldset disabled={isSubmitting} className="min-w-0">
        {contenidoOp}
      </fieldset>
        
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
    </div>




  
      
  );
}
