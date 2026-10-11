import {
  useState,
} from "react"; 

import type {
  NegocioPublico,
} from "@/types/negocios";
import { EnlacesNegocio } from "./EnlacesNegocio";
import { NombreNegocio } from "./NombreNegocio";
import { UbicacionesNegocio } from "./UbicacionesNegocio";
import { ProductosNegocio } from "./ProductoNegocio";
import { ContactosNegocio } from "./ContactoNegocio";
import { textoOrganicos } from "@/lib/negocios";
   
export function NegociosSlider  ({negocios}: {negocios: NegocioPublico[]}){

  const [
      indiceSlider,
      setIndiceSlider,
    ] = useState(0);

   const negocioSlider =
    negocios[indiceSlider] ?? null;

  function mostrarAnterior() {
      setIndiceSlider((actual) =>
        actual === 0
          ? negocios.length - 1
          : actual - 1,
      );
    }

    function mostrarSiguiente() {
      setIndiceSlider((actual) =>
        actual === negocios.length - 1
          ? 0
          : actual + 1,
      );
    }  
   {/* SLIDER: pantallas menores a xl */}
   return(
      <div className="xl:hidden">
        {negocioSlider && (
          <article
            className="
              relative
              overflow-hidden
              rounded-[1.75rem]
              border border-[#d8b98a]
              bg-[linear-gradient(145deg,#fffaf2_0%,#faf8f5_52%,#f4edf5_100%)]
              p-5
              shadow-[0_12px_32px_rgba(105,66,115,0.14)]
              sm:p-6
            "
          >
            <div className="space-y-6">
              <NombreNegocio
                negocio={negocioSlider}
              />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-accent">
                  Ubicaciones
                </h3>

                <UbicacionesNegocio
                  negocio={negocioSlider}
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-accent">
                  Productos
                </h3>

                <ProductosNegocio
                  negocio={negocioSlider}
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-accent">
                  Contacto
                </h3>

                <ContactosNegocio
                  negocio={negocioSlider}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-accent">
                    Productos orgánicos
                  </h3>

                  <p className="text-sm text-muted">
                    {textoOrganicos(
                      negocioSlider.estadoProductosOrganicos,
                    )}
                  </p>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold text-accent">
                    Modalidades
                  </h3>

                  <p className="text-sm text-muted">
                    {negocioSlider.modalidadesVenta.length >
                    0
                      ? negocioSlider.modalidadesVenta.join(
                          " · ",
                        )
                      : "No informado"}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-accent">
                  Enlaces
                </h3>

                <EnlacesNegocio
                  negocio={negocioSlider}
                />
              </div>
            </div>

            <div
              className="
                mt-7 flex
                items-center
                justify-between
                border-t border-line
                pt-5
              "
            >
              <button
                type="button"
                onClick={mostrarAnterior}
                aria-label="Mostrar negocio anterior"
                className="
                  inline-flex h-10 w-10
                  items-center justify-center
                  rounded-full
                  border border-[#d8b98a]
                  bg-white/70
                  text-lg text-accent
                  transition
                  hover:bg-accent-soft
                "
              >
                ←
              </button>

              <p
                aria-live="polite"
                className="text-xs font-semibold text-muted"
              >
                {indiceSlider + 1} /{" "}
                {negocios.length}
              </p>

              <button
                type="button"
                onClick={mostrarSiguiente}
                aria-label="Mostrar siguiente negocio"
                className="
                  inline-flex h-10 w-10
                  items-center justify-center
                  rounded-full
                  border border-[#d8b98a]
                  bg-white/70
                  text-lg text-accent
                  transition
                  hover:bg-accent-soft
                "
              >
                →
              </button>
            </div>
          </article>
        )}
      </div>
    );
   }