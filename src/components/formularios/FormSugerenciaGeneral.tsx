"use client";

import { useState } from "react";

export function FormSugerenciaGeneral() {
  const [value, setValue] = useState("");

  return (
    <form
      action="https://formspree.io/f/mwlvryon"
      method="POST"
      target="_blank"
      className="
        w-full rounded-[1.5rem] border border-[#D8D0BE]
        bg-[#FFFDF8] p-5 shadow-sm
        sm:p-6
      "
    >
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6F745E]">
          Tu opinión también suma
        </p>

        <h2 className="mt-2 font-display text-2xl font-semibold text-[#354B2B]">
          Sugerencia general
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6F745E]">
          Si hay algo que te gustaría proponer, mejorar o incorporar en
          Conciencia Alimentaria, podés hacerlo.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="sugerencia-general"
          className="text-sm font-medium text-[#49633B]"
        >
          Escribí tu sugerencia
        </label>

        <textarea
          id="sugerencia-general"
          name="seleccion"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          rows={6}
          required
          placeholder="Escribí tu mensaje..."
          className="
            min-h-36 w-full resize-y overflow-y-auto
            rounded-xl border border-[#D8D0BE] bg-white
            px-4 py-3 text-sm leading-relaxed text-[#354B2B]
            outline-none transition
            placeholder:text-[#9A9D8E]
            focus:border-[#49633B]
            focus:ring-2 focus:ring-[#49633B]/20
          "
        />
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={!value.trim()}
          className="
            inline-flex min-h-11 w-full items-center justify-center
            rounded-full bg-[#49633B] px-6 py-2.5
            text-sm font-semibold text-white
            transition
            hover:bg-[#3E5533]
            focus:outline-none focus:ring-2
            focus:ring-[#49633B]/30 focus:ring-offset-2
            disabled:cursor-not-allowed disabled:opacity-45
            sm:w-auto
          "
        >
          Enviar sugerencia
        </button>
      </div>
    </form>
  );
}
