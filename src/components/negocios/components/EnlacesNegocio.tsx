import type {
  NegocioPublico,
} from "@/types/negocios";

export function EnlacesNegocio({
  negocio,
}: {
  negocio: NegocioPublico;
}) {
  if (
    !negocio.sitioWebUrl &&
    !negocio.tiendaOnlineUrl
  ) {
    return (
      <span className="text-xs text-muted">
        Sin enlaces informados
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {negocio.sitioWebUrl && (
        <a
          href={negocio.sitioWebUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
            block
            text-xs font-semibold
            text-accent
            hover:underline
          "
        >
          Sitio web
        </a>
      )}

      {negocio.tiendaOnlineUrl && (
        <a
          href={negocio.tiendaOnlineUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="
            block
            text-xs font-semibold
            text-accent
            hover:underline
          "
        >
          Tienda online
        </a>
      )}
    </div>
  );
}