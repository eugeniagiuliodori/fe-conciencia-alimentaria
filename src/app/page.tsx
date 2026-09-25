import Image from "next/image";
import { PublicationCard } from "@/components/PublicationCard";
import { publications } from "@/data/publications";
import Link from "next/link";
import fs from "fs";
import path from "path";


export default function Home() {

   const noticiaPath = path.join(
    process.cwd(),
    "public/images/publicaciones/noticiadeldia/noticiadeldia.png"
  );

  const existeNoticia = fs.existsSync(noticiaPath);
  const existeLink = true;
  

  const imageSrc = existeNoticia
    ? "/images/publicaciones/noticiadeldia/noticiadeldia.png"
    : "/images/publicaciones/noticiadeldia/iconnoticia.png";

     const LinkSrc = existeNoticia
    ? "https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag519/8787855?utm_source=chatgpt.com"
    : "/images/publicaciones/noticiadeldia/empty.png";

  return (
    <>
      <section
        aria-labelledby="intro-title"
        className="site-container grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20"
      >
        <div>
          <p className="mb-5 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            Un espacio para aprender
          </p>
          <h1
            id="intro-title"
            className="max-w-xl font-display text-4xl leading-[1.12] text-balance sm:text-5xl lg:text-6xl"
          >
            Una mirada curiosa{" "}
            <span className="text-accent">sobre lo que comemos.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Bienvenidos a Conciencia Alimentaria. 
          </p>
           <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
            Un lugar para explorar los
            alimentos, la nutrición, las recetas y la fermentación a través de
            videos y textos.
           </p>
          <a href="#publicaciones" className="primary-link mt-8">
            Explorar publicaciones <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="overflow-hidden rounded-3xl bg-transparent">
          <Image
            src="/images/perfil.png"
            alt=""
            width={800}
            height={620}
            sizes="(min-width: 1184px) 544px, (min-width: 1024px) calc((100vw - 96px) / 2), calc(100vw - 32px)"
            className="h-auto w-full"
            preload
          />
        </div>
      </section>
      <section    aria-labelledby="noticia-del-dia"
       className="site-container grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-1 lg:gap-16 lg:py-20"
      >
        <div  className="flex flex-col justify-self-center text-center">
          <p className=" mb-5 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            Una noticia actual relacionada a la alimentación
          </p>
           <div className=" overflow-hidden rounded-3xl bg-transparent">
          <Image
            src={imageSrc}
            alt=""
            width={800}
            height={620}
            className= {  existeNoticia
            ? "mx-auto h-auto w-[clamp(280px,70vw,520px)] max-w-full"
            : "mx-auto h-auto w-[180px]"
            }   
            preload
          />
        </div>
        <div className="text-center">
          <Link
            href={LinkSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link  inline-flex w-fit items-center rounded-sm text-sm font-semibold"
          >        
             { existeLink ? "Leer noticia completa" : "Ver" }
            <span className="sr-only">: Noticia del día</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        </div>
      </section>
      <section
        id="publicaciones"
        aria-labelledby="publications-title"
        className="site-container border-t border-line py-12 sm:py-16"
      >
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <h2
              id="publications-title"
              className="font-display text-3xl sm:text-4xl"
            >
              Publicaciones
            </h2>
          </div>
        
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {publications.map((publication) => (
            <PublicationCard key={publication.slug} publication={publication} />
          ))}
        </div>
      </section>

      <section
        id="proyecto"
        aria-labelledby="project-title"
        className="site-container mb-12 grid gap-7 rounded-3xl bg-sand p-6 sm:mb-16 sm:p-10 lg:grid-cols-1 lg:gap-16 lg:p-12"
      >
        
        <div className="space-y-4 text-base leading-relaxed text-muted">
          <h2
            id="project-title"
            className="max-w-sm font-display text-2xl leading-tight sm:text-4xl sm:max-w-4xl"
          >
            Más espacio para cada tema
          </h2>
          <p>
            Conciencia Alimentaria es un proyecto para acercar información, para 
            invitar a un camino propio de hábitos desde lo compartido, investigando,
            cuestionando o descubriendo desde la validación, toda información que
            desde Conciencia Alimentaria se publica.
            Enonctrarás un espacio dedicado a los alimentos, la nutrición, las recetas y la fermentación.
          </p>
          <p>
            Este sitio acompaña al canal de YouTube y ofrece un espacio propio
            para organizar los contenidos, ampliar las explicaciones y reunir las
            fuentes de cada publicación cuando estén disponibles.
          </p>
          <p>
            Esta web será el lugar exclusivo para algunos de los textos y contenidos que se compartan, que no encontrarás en el canal de youtube.
          </p>
          <div className="flex w-full justify-center px-4">
            <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-[#D8D0BE] bg-[#EEF0DC]/60 px-5 py-4 text-center shadow-sm">
              <p className="text-sm font-medium text-[#6F745E]">
                Podés encontrar contenido desde
              </p>

              <a
                href="https://www.youtube.com/@PropuestaConcienciaAlimentaria"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#49633B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#354B2B] sm:w-auto"
              >
                <span>▶</span>
                <span>YouTube · Conciencia Alimentaria</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
