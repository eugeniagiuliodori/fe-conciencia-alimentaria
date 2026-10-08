'use client'

import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {

  const [abrirmenu, setAbrirMenu] = useState(false);

  return (
    <header className="border-b border-line w-full">
      <div className="relative w-full px-[2%] text-sm md:text-base lg:text-lg flex gap-2 py-5 flex-row items-center justify-between">
          <span className=" shadow-[5px_5px_9px_4px_rgba(147,68,47,1)] w-[10rem] md:w-[15rem] flex text-lg md:text-xl p-[1rem]  rounded-[0.5em] justify-between items-center justify-center font-display    leading-tight bg-accent-soft text-accent rounded-[50%]">
          <span >
            Conciencia
            <br />
            Alimentaria
          </span>
          <span className="flex items-center justify-center text-xl md:text-5xl text-accent">❦</span>
          </span>
          <span className="hidden md:block md:absolute left-1/2 -translate-x-1/2 text-subaccent md:text-lg lg:text-2xl  font-serif italic "><span className="flex items-center justify-center shadow-[0px_5px_10px_1px_rgba(147,68,47,1)] p-[0.5rem] rounded-[1rem]">El conocimiento también nutre</span></span>
        <nav aria-label="Navegación principal" className="relative flex flex-col  items-center md:items-end ">
          
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={() => setAbrirMenu(!abrirmenu)}
            className="
              flex h-10 w-10 flex-col items-center justify-center gap-1.5
              rounded-lg
              bg-accent-soft
              text-[#93442f]
              transition-all duration-200
              shadow-[0px_0px_10px_7px_rgba(147,68,47,1)]
              hover:shadow-[0px_0px_10px_7px_rgba(255,255,255,0.95)]
              active:shadow-[0_2px_10px_rgba(255,255,255,1)]
            "
          >
            <span className="block h-0.5 p-0 w-6 bg-current" />
            <span className="block h-0.5 p-0 w-6 bg-current" />
            <span className="block h-0.5 p-0 w-6 bg-current" />
          </button>
          {abrirmenu &&
           <ul className="absolute top-12 right-1 flex w-max flex-col items-end gap-2 text-sm md:text-base lg:text-lg">
            <li className="rounded-lg shadow-[0px_0px_10px_7px_rgba(147,68,47,1)] hover:shadow-[0px_0px_10px_7px_rgba(255,255,255,0.95)]">
              <Link
                href="/#publicaciones"
                className="inline-flex  min-h-11 items-center whitespace-nowrap rounded-lg px-3 bg-accent-soft text-accent"
              >
                Publicaciones
              </Link>
            </li>
            <li className="rounded-xl shadow-[0px_0px_10px_7px_rgba(147,68,47,1)] hover:shadow-[0px_0px_10px_7px_rgba(255,255,255,0.95)]">
              <Link
                href="/#proyecto"
                className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 bg-accent-soft text-accent"
              >
                El proyecto
              </Link>
            </li>
          </ul>
          }
        </nav>
      </div>
    </header>
  );
}
