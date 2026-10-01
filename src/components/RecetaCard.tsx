import Image from "next/image";
import Link from "next/link";
import type { Receta } from "@/data/recetas";

export function RecetaCard({ receta }: { receta: Receta }) {
  return (
    
   <div
  className="
     w-full min-w-0 max-w-md
    sm:only:col-span-2
    lg:only:col-span-3
    only:justify-self-center
  "
>
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
     
      <div className="w-full p-6">
        <Link
          href={`/recetas/${receta.slug}`}
          className="text-link flex w-full flex-col items-start gap-3"
        >
          <div>
            Ver receta
            <span className="sr-only">: {receta.title}</span>
            <span aria-hidden="true"> →</span>
          </div>
      {receta.image && (
        <div
          style={{
            aspectRatio: `${receta.ratiox} / ${receta.ratioy}`,
          }}
            className="relative block h-auto w-sm max-w-full rounded-xl"
        >
          <Image
            src={receta.image.previewsrc??receta.image.src}
            alt={receta.image.alt}
            fill
            loading="lazy"
            sizes="auto, (max-width: 24rem) 100vw, 24rem"
            className="object-cover"
          />
        </div>
      )}

          {receta.videoUrl && (
            <video
              src={receta.videoUrl}
              preload="metadata"
              muted
              playsInline
              className="block h-auto w-full rounded-xl"
            />
          )}

        </Link>
      </div>
    </article>
    </div>
  );
}