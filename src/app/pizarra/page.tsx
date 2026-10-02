
import Link from "next/link";
import { EditorConciencia } from "@/components/EditorConciencia";

export default async function PizzaraPage() {
  
  return (
    <div className="site-container py-8 sm:py-12 w-[80%]">
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
                   <div className="w-full text-center">
                     <h2
                       id="publications-title"
                       className="font-display text-3xl sm:text-4xl"
                     >
                       Pizarra
                     </h2>
                   </div>     
                 </div>
                 <EditorConciencia/>
      </div>
    </div>
  );
}
