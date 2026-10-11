import { NegociosNaturistas } from "@/components/negocios/NegociosNaturistas";
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
                      className="text-sm rounded-lg border border-accent px-2 py-2 text-accent cursor-pointer hover:text-[#7a263a] no-underline hover:no-underline text-link inline-flex  items-center"
                      >
                        
                          Volver a la página principal

                      </Link>
                    </div>
                  
                 </div>
                <NegociosNaturistas/>
      </div>
    </div>
  );
}
