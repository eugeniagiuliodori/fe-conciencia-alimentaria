import Link from "next/link";

export default function NotFound() {
  return (
    <div className="site-container py-20 sm:py-28">
      <div className="mx-auto max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold tracking-widest text-accent">
          404
        </p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          No encontramos esta página
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted">
          Puede que el enlace haya cambiado o que la publicación no esté
          disponible. Podés volver al inicio para explorar el contenido del sitio.
        </p>
        <Link href="/" className="primary-link mt-8">
          Volver al inicio <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
