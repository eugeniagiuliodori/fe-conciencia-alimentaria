"use client";

import { FormEvent, useState } from "react";

type OwnerModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function OwnerModal({
  isOpen,
  onClose,
}: OwnerModalProps) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret }),
      });

      if (!response.ok) {
        setError("La clave no es válida.");
        return;
      }

      setSecret("");
      onClose();
    } catch {
      setError("No se pudo realizar la validación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-modal-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2
          id="owner-modal-title"
          className="mb-4 text-lg font-semibold"
        >
          Identificación de owner
        </h2>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="owner-secret"
            className="mb-2 block text-sm font-medium"
          >
            Clave
          </label>

          <input
            id="owner-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-md border px-3 py-2"
          />

          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border px-4 py-2"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || secret.length === 0}
              className="rounded-md bg-[#49633B] px-4 py-2 text-white disabled:opacity-50"
            >
              {isSubmitting ? "Validando..." : "Validar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}