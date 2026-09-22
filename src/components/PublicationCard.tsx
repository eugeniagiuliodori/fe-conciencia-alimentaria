import Image from "next/image";
import Link from "next/link";
import type { Publication } from "@/data/publications";

export function PublicationCard({ publication }: { publication: Publication }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface justify-center">
      {publication.image && (
        <div  style={{ aspectRatio: `${publication.ratiox} / ${publication.ratioy}` }}className=" flex  relative aspect-[8/15] bg-sand">
          <Image
            src={publication.image.src}
            alt={publication.image.alt}
            fill
           
            className="object-cover"
          />
        </div>
      )}
      <div className=" flex flex-col pl-6 ">
       
        <Link
          href={`/publicaciones/${publication.slug}`}
          className="text-link mt-5 inline-flex min-h-11 w-fit items-center gap-3 rounded-sm text-sm font-semibold"
        >
         
             Leer publicación
          <span className="sr-only">: {publication.title}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
