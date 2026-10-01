'use client'

import {FuentesDrawer} from "@/components/FuentesDrawer";
import Image from "next/image";

export function HistorialNoticiasSection() {
  

  return (
    
<div className="site-container mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">

  <div className="mb-7 text-center">

    <p className="mt-2 text-sm text-[#6F745E]">
      Investigaciones y publicaciones que nutren nuestro conocimiento.
    </p>
  </div>
  <div className="mx-auto w-full max-w-3xl px-4 py-6">
    <Image
        src="/images/resumenpendiente.png"
        alt="Próximamente, una síntesis mensual de las noticias de Conciencia Alimentaria"
        width={1408}
        height={1056}
        loading="eager"
        sizes="(max-width: 48rem) calc(100vw - 2rem), 46rem"
        className="block h-auto w-full rounded-xl object-contain"
    />
  </div>
  <FuentesDrawer/>
</div>

  );
}
