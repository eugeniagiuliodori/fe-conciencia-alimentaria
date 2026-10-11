import type {
  NegocioPublico,
} from "@/types/negocios";

export function NombreNegocio({
  negocio,
}: {
  negocio: NegocioPublico;
}) {
  const nombre =
    negocio.nombreFantasia ??
    negocio.nombreLegal ??
    "Negocio naturista";

  return (
    <div className="space-y-3">
      {negocio.logoOficialUrl && (
        <img
          src={negocio.logoOficialUrl}
          alt={`Logo de ${nombre}`}
          className="
            h-12 w-12
            rounded-xl
            border border-line
            bg-white
            object-contain
            p-1
          "
        />
      )}

      <div>
        <p className="font-display text-base font-semibold text-foreground">
          {nombre}
        </p>

        {negocio.nombreLegal &&
          negocio.nombreLegal !==
            negocio.nombreFantasia && (
            <p className="mt-1 text-xs text-muted">
              {negocio.nombreLegal}
            </p>
          )}

        {negocio.cuit && (
          <p className="mt-1 text-xs text-muted">
            CUIT: {negocio.cuit}
          </p>
        )}
      </div>

      {negocio.descripcion && (
        <p className="text-xs leading-relaxed text-muted">
          {negocio.descripcion}
        </p>
      )}
    </div>
  );
}
