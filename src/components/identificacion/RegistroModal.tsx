"use client";

import Image from "next/image";

export function RegistroModal() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Próximamente identificación de usuario"
      className="flex w-full min-w-0 items-center justify-center"
    >
      <Image
        src="/images/registrousuario.png"
        alt="Próximamente identificación de usuario"
        width={1122}
        height={1402}
        sizes="(max-width: 680px) calc(100vw - 32px), 650px"
        className="block h-auto w-full max-h-[calc(100dvh-2rem)] rounded-2xl object-contain shadow-[0_25px_80px_rgba(43,36,49,0.35)]"
      />
    </div>
  );
}
