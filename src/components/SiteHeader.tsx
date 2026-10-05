import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="px-[2%] text-sm md:text-base lg:text-lg flex gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span className="w-[42%] md:w-[15%] flex sm:justify-between sm:items-center justify-center font-display text-xl md:text-3xl py-[7%] md:p-[2%] leading-tight bg-accent-soft text-accent rounded-[50%]">
          <span >
            Conciencia
            <br />
            Alimentaria
          </span>
          <span className="flex item-center justify-center text-xl md:text-5xl text-accent">❦</span>
          </span>
        <nav aria-label="Navegación principal ">
          <ul className="flex flex-wrap gap-1 text-sm sm:gap-3 text-sm md:text-base lg:text-lg">
            <li>
              <Link
                href="/#publicaciones"
                className="inline-flex  min-h-11 items-center rounded-lg px-3 bg-accent-soft text-accent"
              >
                Publicaciones
              </Link>
            </li>
            <li>
              <Link
                href="/#proyecto"
                className="inline-flex min-h-11 items-center rounded-lg px-3 bg-accent-soft text-accent"
              >
                El proyecto
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
