'use client'

import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {

  const [abrirmenu, setAbrirMenu] = useState(false);

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
        <nav aria-label="Navegación principal" className="relative flex flex-col  items-center md:items-end ">
          
          <button
            type="button"
            aria-label="Abrir menú"
            onClick={()=>{setAbrirMenu(!abrirmenu)}}
            className="flex h-10 w-10 flex-col items-center  justify-center gap-1.5 "
          >
            <span className="block h-0.5 w-6 bg-current" />
            <span className="block h-0.5 w-6 bg-current" />
            <span className="block h-0.5 w-6 bg-current" />
          </button>
          {abrirmenu &&
           <ul className="absolute top-10 right-1 flex w-max flex-col items-end gap-2 text-sm md:text-base lg:text-lg">
            <li>
              <Link
                href="/#publicaciones"
                className="inline-flex  min-h-11 items-center whitespace-nowrap rounded-lg px-3 bg-accent-soft text-accent"
              >
                Publicaciones
              </Link>
            </li>
            <li>
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
