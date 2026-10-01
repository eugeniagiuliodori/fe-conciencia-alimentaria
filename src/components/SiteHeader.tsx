import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="px-[2%] text-sm md:text-base lg:text-lg flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span className="font-display text-xl leading-tight">
            Conciencia
            <br />
            Alimentaria
          </span>
        <nav aria-label="Navegación principal ">
          <ul className="flex flex-wrap gap-1 text-sm sm:gap-3 text-sm md:text-base lg:text-lg">
            <li>
              <Link
                href="/#publicaciones"
                className="inline-flex  min-h-11 items-center rounded-lg px-3 hover:bg-accent-soft hover:text-accent"
              >
                Publicaciones
              </Link>
            </li>
            <li>
              <Link
                href="/#proyecto"
                className="inline-flex min-h-11 items-center rounded-lg px-3 hover:bg-accent-soft hover:text-accent"
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
