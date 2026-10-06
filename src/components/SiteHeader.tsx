import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="px-[2%] text-sm md:text-base lg:text-lg flex gap-2 py-5 flex-row items-center justify-between">
          <span className="w-[10rem] md:w-[17%] flex text-lg md:text-2xl p-[1rem]  rounded-[0.5em] justify-between items-center justify-center font-display    leading-tight bg-accent-soft text-accent rounded-[50%]">
          <span >
            Conciencia
            <br />
            Alimentaria
          </span>
          <span className="flex item-center justify-center text-xl md:text-5xl text-accent">❦</span>
          </span>
        <nav aria-label="Navegación principal ">
          <ul className="flex flex-wrap gap-1 text-sm gap-2 text-sm md:text-base lg:text-lg">
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
