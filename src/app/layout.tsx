import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { VisitTracker } from "@/components/VisitTracker";
import { IdentificationProvider } from "@/components/identificacion/IdentificationProvider";
import "./globals.css";

const title = "Conciencia Alimentaria";
const description =
  "Un espacio educativo sobre alimentos, nutrición, recetas y fermentación. Videos y textos para explorar cada tema con curiosidad.";

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s | Conciencia Alimentaria",
  },
  description,
  openGraph: {
    title,
    description,
    siteName: title,
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialStatus = (await cookies()).has("ca_sesion") ? "identified" : "anonymous";

  return (
    <html lang="es">
      <body className="fondo-conciencia">
        <IdentificationProvider key={initialStatus} initialStatus={initialStatus}>
          <a
            href="#contenido"
            className="sr-only z-50 rounded-lg bg-surface font-semibold text-accent focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:p-4"
          >
            Saltar al contenido
          </a>
          <SiteHeader />
          <main id="contenido" tabIndex={-1} className="flex-1 focus:outline-none bg-transparent">
            <VisitTracker />
            {children}
          </main>
          <SiteFooter />
        </IdentificationProvider>
      </body>
    </html>
  );
}
