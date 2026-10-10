"use client";

import { useState } from "react";
import {MensajeDelDiaModal} from "@/components/MensajeDelDiaModal";

export function MensajeDelDia() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          group relative mt-8 inline-flex
          items-center justify-center
          overflow-hidden rounded-[1rem]
          border border-[#d8b98a]
          bg-[linear-gradient(135deg,#fffaf2_0%,#f8ede1_52%,#f1e4ef_100%)]
          px-5 py-3
          text-sm font-semibold tracking-[0.03em]
          text-accent
          shadow-[0_10px_28px_rgba(105,66,115,0.16)]
          transition-all duration-300
          hover:-translate-y-0.5
          hover:border-accent/40
          hover:shadow-[0_14px_34px_rgba(105,66,115,0.24)]
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-accent/30
          after:absolute
          after:inset-y-0
          after:left-[-35%]
          after:w-[22%]
          after:skew-x-[-20deg]
          after:bg-white/45
          after:blur-sm
          after:transition-all
          after:duration-700
          hover:after:left-[115%]
        "
      >
        <span className="relative z-10 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="
              text-base
              transition-transform duration-300
              group-hover:rotate-12
              group-hover:scale-110
            "
          >
            ✦
          </span>

          Tu mensaje para hoy
        </span>
      </button>

      <MensajeDelDiaModal
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}