"use client";

import { useState } from "react";
import { SessionUserModal } from "./shared/SessionUserModal";
import { InitSessionMsg } from "./InitSessionMsg";
import { RegisterMsg } from "./RegisterMsg";
import { useIdentification } from "./IdentificationProvider";
import { iniciarSesion, registrarCorreo } from "./solicitudes";

type IdentificationModalProps = {
  open: boolean;
  onClose: () => void;
};

const switchButtonClass = "group inline-flex w-auto max-w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#a98aa7]/75 bg-[linear-gradient(135deg,#f4e4f0_0%,#e8d9ee_55%,#e7e9df_100%)] px-4 py-1.5 text-sm font-semibold text-[#673b63] shadow-[0_3px_12px_rgba(107,74,114,0.17),inset_0_1px_0_rgba(255,255,255,0.85)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#80638b] hover:bg-[linear-gradient(135deg,#ecdaed_0%,#daccdf_100%)] hover:shadow-[0_8px_22px_rgba(105,66,115,0.18)] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:px-6";

export function FormIdentificationModal({ open, onClose }: IdentificationModalProps) {
  const [flow, setFlow] = useState<"register" | "session">("register");
  const { confirmSessionStarted } = useIdentification();

  function handleClose() {
    setFlow("register");
    onClose();
  }

  if (!open) return null;

  return (
    <SessionUserModal
      key={flow}
      open={open}
      onClose={handleClose}
      contenidoMsg={flow === "register" ? <RegisterMsg /> : <InitSessionMsg />}
      onSubmit={flow === "register" ? registrarCorreo : async (email) => {
        const result = await iniciarSesion(email);
        if (result.ok) confirmSessionStarted();
        return result;
      }}
      contenidoOp={
        <section className="mt-2 flex flex-col items-center justify-center gap-1.5 text-center">
          <p className="max-w-full break-words text-xs font-medium leading-snug text-[#75455d] sm:text-[13px]">
            {flow === "register"
              ? "Si ya registraste tu correo, iniciá tu sesión"
              : "Si todavía no registraste tu correo, hacelo primero"}
          </p>
          <button
            type="button"
            onClick={() => setFlow(flow === "register" ? "session" : "register")}
            className={switchButtonClass}
          >
            <span>{flow === "register" ? "Iniciar sesión" : "Registrar correo"}</span>
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </section>
      }
    />
  );
}
