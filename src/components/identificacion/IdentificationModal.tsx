"use client";

import { useState } from "react";
import { FormIdentificationModal } from "./FormIdentificationModal";
import Image from "next/image";


export function IdentificationModal() {
  const [open, setOpen] = useState(false);



  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir identificación por correo"
        className="
          group relative mt-8 inline-flex
          justify-center
          rounded-full
          p-2
          transition-transform duration-300
          hover:scale-110
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-accent/50
        "
      >
        <Image
          src="/images/corazon-verde.png"
          alt=""
          width={90}
          height={90}
          className="
            h-[70px] w-[90px]
            object-contain
            animate-heartbeat
            group-hover:[animation-duration:0.8s]
            drop-shadow-[0_0_12px_rgba(145,220,65,0.85)]
            group-hover:drop-shadow-[0_0_22px_rgba(145,220,65,1)]
            transition-[filter] duration-300
            cursor-pointer
          "
        />
      </button>
      <FormIdentificationModal  open={open} onClose={() => setOpen(false)} /> 
    </>
  );
}