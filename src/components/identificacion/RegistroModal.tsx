"use client";

import Image from "next/image";

export function RegistroModal() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Próximamente identificación de usuario"
      className="
        flex items-center justify-center
        max-w-full
      "
    >
      <Image
        src="/images/registrousuario.png"
        alt="Próximamente identificación de usuario"
        width={1122}
        height={1402}
        sizes="(max-width: 640px) 90vw, 650px"
        className="
          block
          w-auto h-auto
          max-w-[min(650px,90vw)]
          max-h-[85dvh]
          object-contain
          rounded-2xl
          shadow-[0_25px_80px_rgba(43,36,49,0.35)]
        "
      />
    </div>
  );
}