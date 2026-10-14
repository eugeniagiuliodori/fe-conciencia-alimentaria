import OwnerAccess from "@/components/owner/OwnerAccess";

export function SiteFooter() {
  function envBoolean(
    value: string | undefined,
  ): boolean {
    return value === "true";
  }

  return (
    <footer className="border-t border-[#D8D0BE] bg-transparent">
      <div className="site-container flex flex-col items-center gap-6 py-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#A3A878] bg-[#EEF0DC]">
            <span className="text-xl text-[#49633B]">
              🌿
            </span>
          </div>

          <div>
            <p className="font-display text-lg font-semibold tracking-wide text-[#354B2B]">
              Conciencia Alimentaria
            </p>

            <p className="mt-1 text-sm leading-relaxed text-[#6F745E]">
              Una mirada curiosa sobre lo que comemos.
            </p>
          </div>
        </div>

        <div className="w-full max-w-xl border-t border-[#D8D0BE] pt-5">
          <p className="text-sm font-semibold text-[#354B2B]">
            Desarrollado por María Eugenia Giuliodori
          </p>

          <p className="mt-1 text-sm text-[#6F745E]">
            Analista en Computación · Desarrolladora de Software
          </p>
          <nav
            aria-label="Contacto profesional"
            className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm"
          >
            <a
              href="https://mail.google.com/mail/?view=cm&fs=1&to=espaciocienciatecno@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#49633B] underline-offset-4 hover:underline"
            >
              Email
            </a>

            <a
              href="https://www.linkedin.com/in/eugeniagiuliodori"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#49633B] underline-offset-4 hover:underline"
            >
              LinkedIn
            </a>

            <a
              href="https://www.github.com/eugeniagiuliodori"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#49633B] underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>

      {envBoolean(
        process.env.SHOW_OWNER_BUTTON,
      ) && <OwnerAccess />}
    </footer>
  );
}