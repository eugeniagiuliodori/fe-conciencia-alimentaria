import type {
  NegocioPublico,
} from "@/types/negocios";
import { ValorContacto } from "./ValorContacto";

export function ContactosNegocio({
  negocio,
}: {
  negocio: NegocioPublico;
}) {
  if (negocio.contactos.length === 0) {
    return (
      <span className="text-xs text-muted">
        Sin contactos informados
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {negocio.contactos.map(
        (contacto, index) => (
          <div
            key={`${contacto.tipo}-${contacto.valor}-${index}`}
            className="text-xs"
          >
            <p className="font-semibold capitalize text-foreground">
              {contacto.tipo}
            </p>

            <ValorContacto
                valor={contacto.valor}
                />
          </div>
        ),
      )}
    </div>
  );
}

