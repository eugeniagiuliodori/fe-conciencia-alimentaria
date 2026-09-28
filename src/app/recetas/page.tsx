import { recetas } from "@/data/recetas";
import { RecetaCard } from "@/components/RecetaCard";

export default async function RecetasPage() {
  
  return (
    <div className="site-container py-8 sm:py-12 w-[80%]">
      <div className="mx-auto max-w-full">

         <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
                   <div className="w-full text-center">
                     <h2
                       id="publications-title"
                       className="font-display text-3xl sm:text-4xl"
                     >
                       Recetas
                     </h2>
                   </div>
                 
                 </div>
                 <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                   {recetas.map((receta) => (
                     <RecetaCard key={receta.slug} receta={receta} />
                   ))}
                 </div>

        


       
      </div>
    </div>
  );
}
