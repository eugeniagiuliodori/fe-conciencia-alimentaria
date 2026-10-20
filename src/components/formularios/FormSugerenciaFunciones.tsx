export function FormSugerenciaFunciones() {
  return (
    <form
      action="https://formspree.io/f/mqpeynav"
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
          Podés ser parte sobre la dirección de evolución de la web
        </p>

        <h2 className="mt-2 font-display text-2xl font-semibold text-[#354B2B]">
           Elegí la opción que más te interese
        </h2>

      </div>

      <fieldset className="grid gap-3">
        <legend className="sr-only">
          ¿Qué te gustaría que Conciencia Alimentaria expanda?
        </legend>

        <label
          className="
            flex cursor-pointer items-center gap-3
            rounded-xl border border-[#D8D0BE] bg-white
            px-4 py-3 text-sm text-[#354B2B]
            transition
            hover:border-[#A3A878] hover:bg-[#EEF0DC]/40
            focus-within:border-[#49633B]
            focus-within:ring-2 focus-within:ring-[#49633B]/20
          "
        >
          <input
            type="radio"
            name="seleccion"
            value="Opcion1"
            required
            className="h-4 w-4 shrink-0 accent-[#49633B]"
          />
          <span>Mostrar información relacionada a &apos;alimentación&apos; del cuerpo más allá de los alimentos</span>
        </label>

        <label
          className="
            flex cursor-pointer items-center gap-3
            rounded-xl border border-[#D8D0BE] bg-white
            px-4 py-3 text-sm text-[#354B2B]
            transition
            hover:border-[#A3A878] hover:bg-[#EEF0DC]/40
            focus-within:border-[#49633B]
            focus-within:ring-2 focus-within:ring-[#49633B]/20
          "
        >
          <input
            type="radio"
            name="seleccion"
             value="Opcion2"
            className="h-4 w-4 shrink-0 accent-[#49633B]"
          />
          <span>Mostrar información relacionada a &apos;alimentación nutritiva&apos;</span>
        </label>

        <label
          className="
            flex cursor-pointer items-center gap-3
            rounded-xl border border-[#D8D0BE] bg-white
            px-4 py-3 text-sm text-[#354B2B]
            transition
            hover:border-[#A3A878] hover:bg-[#EEF0DC]/40
            focus-within:border-[#49633B]
            focus-within:ring-2 focus-within:ring-[#49633B]/20
          "
        >
          <input
            type="radio"
            name="seleccion"
            value="Opcion3"
            className="h-4 w-4 shrink-0 accent-[#49633B]"
          />
          <span>Mostrar más recetas</span>
        </label>
      </fieldset>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          className="
            inline-flex min-h-11 w-full items-center justify-center
            rounded-full bg-[#49633B] px-6 py-2.5
            text-sm font-semibold text-white
            transition
            hover:bg-[#3E5533]
            focus:outline-none focus:ring-2
            focus:ring-[#49633B]/30 focus:ring-offset-2
            sm:w-auto
          "
        >
          Enviar selección
        </button>
      </div>
    </form>
  );
}
