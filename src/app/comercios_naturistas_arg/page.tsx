import Image from "next/image";

import Link from "next/link";

export default async function Comercios_naturistas_argPage() {
  

  return (
    <div className="site-container py-8 sm:py-12 w-[90%]">
      <div className="mx-auto max-w-full">

         <div className="mb-8 block-flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
                    <div className="block">
                    <Link
                      href="/#"
                    className="text-link inline-flex min-h-11 items-center gap-3 rounded-sm text-sm"
                    >
                      <span aria-hidden="true">←</span> Volver a la página principal
                    </Link>
                    </div>
                  
                 </div>
                  <div className="mx-auto w-full max-w-3xl px-4 py-6">
                     <Image
                         src="/images/negociospendientes.png"
                         alt="Próximamente, una síntesis mensual de las noticias de Conciencia Alimentaria"
                         width={1408}
                         height={1056}
                         loading="eager"
                         sizes="(max-width: 48rem) calc(100vw - 2rem), 46rem"
                         className="block h-auto w-full rounded-xl object-contain"
                     />
                   </div>
      </div>
    </div>
  );
}
