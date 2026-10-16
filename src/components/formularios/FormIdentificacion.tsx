"use client";

import { useState, type FormEvent } from "react";

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
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

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
      onSubmit={handleSubmit}
      aria-labelledby="identificacion-title"
      aria-busy={isSubmitting}
      className="mx-auto w-full max-w-2xl rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-6"
    >
      <h2
        id="identificacion-title"
        className="font-display text-2xl font-semibold"
      >
        Identificación por correo
      </h2>
      <p
        id="identificacion-aviso"
        className="mt-3 text-sm leading-relaxed text-muted"
      >
        Podés declarar tu correo. No se verifica su titularidad ni se inicia una
        sesión. Se eliminan los espacios externos y toda la dirección se convierte
        a minúsculas; puede ser incompatible con proveedores que distinguen
        mayúsculas y minúsculas en la parte anterior a la @.
      </p>

      <div className="mt-5 flex flex-col gap-2">
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
          value={email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            setFeedback(null);
          }}
          aria-describedby="identificacion-aviso"
          className="min-h-12 min-w-0 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base"
        />
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="primary-link w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {isSubmitting ? "Enviando…" : "Enviar identificación"}
        </button>
      </div>
      <p
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
    </form>
  );
}
