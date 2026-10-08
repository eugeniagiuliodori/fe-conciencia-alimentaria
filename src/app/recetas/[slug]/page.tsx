import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getRecetaBySlug, recetas } from "@/data/recetas";
import { ModoCocina } from "@/components/ModoCocina";

type RecetaPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return recetas.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: RecetaPageProps): Promise<Metadata> {
  const { slug } = await params;
  const receta = getRecetaBySlug(slug);

  if (!receta) notFound();

  const title = receta.title;

  return {
    title,
    description: receta.summary,
    robots:  undefined,
    openGraph: {
      title,
      description: receta.summary,
      siteName: "Conciencia Alimentaria",
      locale: "es_AR",
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description: receta.summary,
    },
  };
}

export default async function RecetaPage({ params }: RecetaPageProps) {
  const { slug } = await params;
  const receta = getRecetaBySlug(slug);

  if (!receta) notFound();

  return (
    <div className="site-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
      <div className="flex flex-col items-center justify-between gap-1  max-w-55">
  
        <ModoCocina/>
  
        <Link
          href="/#"
         className="text-sm rounded-lg border border-accent px-2 py-2 text-accent cursor-pointer hover:text-[#7a263a] no-underline hover:no-underline text-link inline-flex  items-center"
        >
          
            Volver a la página principal

        </Link>
          <Link
            href="/recetas"
            className="text-sm rounded-lg border border-accent px-2 py-2 text-accent cursor-pointer hover:text-[#7a263a] no-underline hover:no-underline text-link inline-flex items-center"
          >
                Todas las recetas
          </Link>
           
        </div>
        <article>
          <header>
           
            <h1 className="font-display text-4xl leading-tight text-balance sm:text-5xl">
              {receta.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              {receta.summary}
            </p>
          </header>

        

          {receta.image && (
            <Image
              src={receta.image.src}
              alt={receta.image.alt}
              width={receta.image.width}
              height={receta.image.height}
              className="mt-8 h-full w-full rounded-2xl"
            />
          )}

          {receta.youtubeId && (
            <section aria-labelledby="video-title" className="mt-10">
              <h2 id="video-title" className="mb-5 font-display text-2xl">
                Video de la publicación
              </h2>
              <VideoEmbed
                youtubeId={receta.youtubeId}
                title={receta.title}
              />
            </section>
          )}

          {receta.videoUrl && (
            <a
              href={receta.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link mt-6 flex w-full flex-col items-start gap-2 rounded-sm"
            >
              <span className="inline-flex min-h-11 items-center gap-2">
                Ver video <span aria-hidden="true">↗</span>
              </span>

              <video
                src={receta.videoUrl}
                preload="metadata"
                muted
                playsInline
                className="w-full rounded-xl"
              />
            </a>
          )}

          <div className="mt-10 space-y-5 text-base leading-8 sm:text-lg">
            {receta.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {!!receta.sources?.length && (
            <section
              aria-labelledby="sources-title"
              className="mt-10 border-t border-line pt-8"
            >
              <h2 id="sources-title" className="font-display text-2xl">
                Fuentes y referencias
              </h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-base leading-relaxed">
                {receta.sources.map((source, index) => (
                  <li key={index} className="pl-1">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link rounded-sm"
                      >
                        {source.title}
                        <span className="sr-only">
                          {" "}
                          (se abre en una pestaña nueva)
                        </span>
                      </a>
                    ) : (
                      source.title
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        
      </div>
    </div>
  );
}
