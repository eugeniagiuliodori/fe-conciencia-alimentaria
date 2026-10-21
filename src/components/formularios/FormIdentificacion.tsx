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
      className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:rounded-3xl sm:p-3"
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
      
          <RegistroModal />
        </div>
      ) : (
        <>
      <h2
        id="identificacion-title"
        className="pr-10 font-display text-lg font-semibold leading-tight sm:text-xl"
      >
        Identificación por correo
      </h2>
      <p
        id="identificacion-aviso"
        className="break-words text-xs leading-snug text-muted sm:text-[13px]"
      >
        Podés registrar tu correo (no se verifica su titularidad). Se eliminan los espacios externos y toda la dirección se convierte
        a minúsculas; puede ser incompatible con proveedores de correo electrónico que distinguen
        mayúsculas y minúsculas en la parte anterior a la @.
      </p>

      <div className="flex min-w-0 flex-col items-center gap-0.5">
        <label htmlFor="identificacion-email" className="text-sm font-medium">
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
          className="min-h-10 min-w-0 w-[20rem] rounded-xl border border-line bg-surface px-3 py-2 text-base"
        />
      </div>

      <div className="flex w-full min-w-0 justify-center">
        <button
          type="button"//"submit"
          onClick={()=>{setOpenRegister(true)}}/*con submit quito onclick*/
          disabled={isSubmitting}
          className="primary-link w-full min-w-0 whitespace-normal text-center disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? "Enviando…" : "Enviar identificación"}
        </button>
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
