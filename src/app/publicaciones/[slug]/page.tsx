import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getPublicationBySlug, publications } from "@/data/publications";

type PublicationPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return publications.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PublicationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const publication = getPublicationBySlug(slug);

  if (!publication) notFound();

  const title = publication.isPlaceholder
    ? `${publication.title} (ejemplo)`
    : publication.title;

  return {
    title,
    description: publication.summary,
    robots: publication.isPlaceholder ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description: publication.summary,
      siteName: "Conciencia Alimentaria",
      locale: "es_AR",
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description: publication.summary,
    },
  };
}

export default async function PublicationPage({ params }: PublicationPageProps) {
  const { slug } = await params;
  const publication = getPublicationBySlug(slug);

  if (!publication) notFound();

  return (
    <div className="site-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/#publicaciones"
          className="text-link mb-8 inline-flex min-h-11 items-center gap-3 rounded-sm text-sm"
        >
          <span aria-hidden="true">←</span> Volver a publicaciones
        </Link>
        <article>
          <header>
            <p className="mb-4 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
              {publication.category}
            </p>
            <h1 className="font-display text-4xl leading-tight text-balance sm:text-5xl">
              {publication.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted">
              {publication.summary}
            </p>
          </header>

          {publication.isPlaceholder && (
            <aside
              aria-label="Estado del contenido"
              className="mt-7 rounded-xl border border-line bg-accent-soft p-5 text-sm leading-relaxed"
            >
              <p className="font-semibold text-accent">Contenido de ejemplo</p>
              <p className="mt-1">
                Esta página muestra cómo se verán las publicaciones. El contenido
                definitivo todavía está en preparación.
              </p>
            </aside>
          )}

          {publication.image && (
            <Image
              src={publication.image.src}
              alt={publication.image.alt}
              width={publication.image.width}
              height={publication.image.height}
              sizes="(min-width: 800px) 768px, calc(100vw - 32px)"
              className="mt-8 h-auto w-full rounded-2xl"
            />
          )}

          {publication.youtubeId && (
            <section aria-labelledby="video-title" className="mt-10">
              <h2 id="video-title" className="mb-5 font-display text-2xl">
                Video de la publicación
              </h2>
              <VideoEmbed
                youtubeId={publication.youtubeId}
                title={publication.title}
              />
            </section>
          )}

          {publication.videoUrl && (
            <a
              href={publication.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link mt-6 inline-flex min-h-11 items-center gap-2 rounded-sm"
            >
              Ver video <span aria-hidden="true">↗</span>
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          )}

          <div className="mt-10 space-y-5 text-base leading-8 sm:text-lg">
            {publication.content.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {!!publication.sources?.length && (
            <section
              aria-labelledby="sources-title"
              className="mt-10 border-t border-line pt-8"
            >
              <h2 id="sources-title" className="font-display text-2xl">
                Fuentes y referencias
              </h2>
              <ul className="mt-4 list-disc space-y-3 pl-5 text-base leading-relaxed">
                {publication.sources.map((source, index) => (
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

        <div className="mt-12 border-t border-line pt-6 sm:mt-16">
          <Link
            href="/#publicaciones"
            className="text-link inline-flex min-h-11 items-center gap-3 rounded-sm text-sm"
          >
            <span aria-hidden="true">←</span> Todas las publicaciones
          </Link>
        </div>
      </div>
    </div>
  );
}
