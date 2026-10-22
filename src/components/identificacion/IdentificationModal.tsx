"use client";

import { useRef, useState } from "react";
import { FormIdentificationModal } from "./FormIdentificationModal";
import Image from "next/image";
import { useIdentification } from "./IdentificationProvider";
import { cerrarSesion, type SubmissionResult } from "./solicitudes";


export function IdentificationModal() {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [feedback, setFeedback] = useState<SubmissionResult | null>(null);
  const closing = useRef(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const { status, confirmSessionClosed } = useIdentification();

  function handleModalClose() {
    setOpen(false);
    openButton.current?.focus();
  }

  async function handleSessionClose() {
    if (closing.current) return;
    closing.current = true;
    setIsClosing(true);
    setFeedback(null);
    try {
      const result = await cerrarSesion();
      if (result.ok) confirmSessionClosed();
      setFeedback(result);
    } catch {
      setFeedback({ ok: false, message: "No se pudo confirmar el cierre de sesión. Intentá nuevamente más tarde." });
    } finally {
      closing.current = false;
      setIsClosing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
      <button
        ref={openButton}
        type="button"
        onClick={() => {
          setFeedback(null);
          setOpen(true);
        }}
        aria-label="Abrir identificación por correo"
        className="
          group relative inline-flex
          justify-center
          rounded-full
          p-2
          transition-transform duration-300
          hover:scale-110
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-accent/50
        "
      >
        <Image
          src="/images/corazon-verde.png"
          alt=""
          width={90}
          height={90}
          className="
            h-[60px] w-[78px] sm:h-[70px] sm:w-[90px]
            object-contain
            animate-heartbeat
            group-hover:[animation-duration:0.8s]
            drop-shadow-[0_0_12px_rgba(145,220,65,0.85)]
            group-hover:drop-shadow-[0_0_22px_rgba(145,220,65,1)]
            transition-[filter] duration-300
            cursor-pointer
          "
        />
      </button>
      {status === "identified" && (
        <button
          type="button"
          onClick={handleSessionClose}
          disabled={isClosing}
          className="rounded-full border border-[#a98aa7]/75 bg-[#fffaf8] px-4 py-2 text-sm font-semibold text-[#673b63] shadow-sm transition hover:bg-[#f4e4f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-wait disabled:opacity-60"
        >
          {isClosing ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      )}
      </div>
      {isClosing && <p role="status" className="mt-2 text-sm text-[#704956]">Cerrando sesión…</p>}
      {feedback && (
        <p role={feedback.ok ? "status" : "alert"} className="mt-2 text-sm font-medium text-[#704956]">
          {feedback.message}
        </p>
      )}
      <FormIdentificationModal open={open} onClose={handleModalClose} />
    </>
  );
}
