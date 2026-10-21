"use client";

import { useState, type FormEvent } from "react";
import { RegistroModal } from "../identificacion/RegistroModal";

function errorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Revisá el correo e ingresá una dirección con formato válido.";
    case 413:
      return "La solicitud supera el tamaño permitido. Revisá el correo.";
    case 415:
      return "No se pudo enviar el formulario en el formato requerido. Recargá la página.";
    case 429:
      return "Se alcanzó el límite de solicitudes. Esperá un momento antes de volver a intentar.";
    case 502:
    case 503:
      return "La identificación no está disponible en este momento. No se pudo confirmar la operación. Intentá más tarde.";
    case 504:
      return "No se pudo confirmar la operación a tiempo. Intentá más tarde.";
    default:
      return "No se pudo confirmar la identificación. Intentá nuevamente más tarde.";
  }
}

export function FormIdentificacion() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  
  const [openRegister, setOpenRegister] = useState(false);


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/usuarios/identificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 204) {
        setEmail("");
        setFeedback({
          kind: "success",
          message:
            "Identificación recibida. No se verificó la titularidad del correo ni se inició una sesión.",
        });
      } else {
        setFeedback({ kind: "error", message: errorMessage(response.status) });
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof DOMException && error.name === "TimeoutError"
            ? errorMessage(504)
            : "No se pudo confirmar la operación. Revisá tu conexión e intentá más tarde.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      action="/api/usuarios/identificacion"
      method="POST"
      autoComplete="off"
      /*onSubmit={handleSubmit}*/
      aria-labelledby="identificacion-title"
      aria-busy={isSubmitting}
      className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-2 rounded-2xl border border-[#dbc7aa]/80 bg-[linear-gradient(150deg,rgba(255,255,255,0.95)_0%,rgba(255,250,245,0.9)_60%,rgba(250,241,248,0.92)_100%)] p-3 text-[#382b32] shadow-[0_5px_20px_rgba(91,65,74,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] sm:rounded-3xl sm:p-3"
    >
        {openRegister ? (
        <div className="relative w-full min-w-0 max-w-[650px]">
          <button
            type="button"
            onClick={() => setOpenRegister(false)}
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
      
          <RegistroModal />
        </div>
      ) : (
        <>
      <h2
        id="identificacion-title"
        className="pr-10 font-display text-lg font-semibold leading-tight text-[#713750] [text-shadow:0_1px_0_rgba(255,255,255,0.8)] sm:text-xl"
      >
        Identificación por correo
      </h2>
      <p
        id="identificacion-aviso"
        className="break-words text-xs leading-snug text-[#665b62] sm:text-[13px]"
      >
        Podés registrar tu correo (no se verifica su titularidad). Se eliminan los espacios externos y toda la dirección se convierte
        a minúsculas; puede ser incompatible con proveedores de correo electrónico que distinguen
        mayúsculas y minúsculas en la parte anterior a la @.
      </p>
      <div className="flex flex-col lg:flex-row  gap-2">
      <div className="flex w-full min-w-0 flex-col gap-0.5 lg:w-[35rem]">
          <label htmlFor="identificacion-email" className="text-sm font-medium text-[#704956]">
            Correo electrónico
          </label>
          <input
            id="identificacion-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            readOnly={isSubmitting}
            /*value={email} con submit usar value*/
            /*onChange={(event) => {
              setEmail(event.currentTarget.value);
              setFeedback(null);
            }}*/
            aria-describedby="identificacion-aviso"
            className="min-h-10 min-w-0 w-full rounded-xl border border-[#d9c5d3] bg-white/90 px-3 py-2 text-base text-[#352d35] shadow-[inset_0_1px_3px_rgba(83,58,77,0.06)] outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#a47a9d] focus:shadow-[0_0_0_3px_rgba(164,122,157,0.16)]"
          />
      </div>

      <div className="flex w-full min-w-0 items-end justify-center lg:w-[18rem] lg:justify-end">
        <button
          type="button"//"submit"
          onClick={()=>{setOpenRegister(true)}}/*con submit quito onclick*/
          disabled={isSubmitting}
          className="primary-link !w-auto lg:w-full min-h-[2.5rem] max-h-[2.5rem]  min-w-0 whitespace-normal text-center !border-[#996c88] !bg-[linear-gradient(135deg,#814460_0%,#69405f_100%)] !text-[#fffaf7] !shadow-[0_4px_12px_rgba(102,56,83,0.24)] transition-[background,box-shadow,filter] duration-200 hover:!brightness-110 hover:!shadow-[0_6px_16px_rgba(102,56,83,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ab85a5] disabled:cursor-wait disabled:opacity-60 sm:w-auto;"
        >
          {isSubmitting ? "Enviando…" : "Enviar identificación"}
        </button>
      </div>
      </div>
     {/* <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mt-3 text-sm leading-relaxed"
      >
        {feedback?.kind === "success" ? feedback.message : ""}
      </p>
      <p
        role="alert"
        aria-atomic="true"
        className="text-sm leading-relaxed text-accent"
      >
        {feedback?.kind === "error" ? feedback.message : ""}
      </p>
      */}
      </>
     )}
    </form>
  );
}
