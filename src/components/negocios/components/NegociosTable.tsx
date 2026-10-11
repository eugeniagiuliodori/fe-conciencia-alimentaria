import { NegocioPublico } from "@/types/negocios";
import {
  useState,
  useMemo,
} from "react";
import { construirPaginacion } from "./ConstruirPaginacion";
import { EnlacesNegocio } from "./EnlacesNegocio";
import { NombreNegocio } from "./NombreNegocio";
import { UbicacionesNegocio } from "./UbicacionesNegocio";
import { ProductosNegocio } from "./ProductoNegocio";
import { ContactosNegocio } from "./ContactoNegocio";
import { textoOrganicos } from "@/lib/negocios";

export function NegociosTable ({negocios}: {negocios: NegocioPublico[]}){

      const FILAS_POR_PAGINA = [5, 10, 15, 20];
      

      const [paginaActual, setPaginaActual] =
        useState(1);
    
      const [
        filasPorPagina,
        setFilasPorPagina,
      ] = useState(5);
    
     const negociosPagina = useMemo(() => {
    const inicio =
      (paginaActual - 1) *
      filasPorPagina;

    return negocios.slice(
      inicio,
      inicio + filasPorPagina,
    );
  }, [
    negocios,
    paginaActual,
    filasPorPagina,
  ]);

    const totalPaginas = Math.max(
    1,
    Math.ceil(
      negocios.length / filasPorPagina,
    ),
  );


  const botonesPaginacion =
    useMemo(
      () =>
        construirPaginacion(
          paginaActual,
          totalPaginas,
        ),
      [paginaActual, totalPaginas],
    );

 

  function cambiarFilasPorPagina(
    cantidad: number,
  ) {
    setFilasPorPagina(cantidad);
    setPaginaActual(1);
  }
  

      {/* TABLA: xl en adelante */}
      return (
      <div className="hidden xl:block">
        <div
          className="
            overflow-hidden
            rounded-[1.5rem]
            border border-line
            bg-surface
            shadow-sm
          "
        >
          <div
            className="
              flex items-center
              justify-between
              gap-4
              border-b border-line
              bg-[#faf7f1]
              px-5 py-4
            "
          >
            <p className="text-sm text-muted">
              {negocios.length} negocios
            </p>

            <label className="flex items-center gap-2 text-sm text-muted">
              Filas por página

              <select
                value={filasPorPagina}
                onChange={(event) =>
                  cambiarFilasPorPagina(
                    Number(
                      event.target.value,
                    ),
                  )
                }
                className="
                  rounded-lg
                  border border-line
                  bg-surface
                  px-3 py-2
                  text-sm text-foreground
                  outline-none
                  focus:border-accent
                  focus:ring-2
                  focus:ring-accent/20
                "
              >
                {FILAS_POR_PAGINA.map(
                  (cantidad) => (
                    <option
                      key={cantidad}
                      value={cantidad}
                    >
                      {cantidad}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-accent-soft/40 text-left">
                <th className="w-[16%] px-3 py-4 text-xs font-semibold text-accent">
                  Negocio
                </th>

                <th className="w-[18%] px-3 py-4 text-xs font-semibold text-accent">
                  Ubicaciones
                </th>

                <th className="w-[20%] px-3 py-4 text-xs font-semibold text-accent">
                  Productos
                </th>

                <th className="w-[13%] px-3 py-4 text-xs font-semibold text-accent">
                  Contacto
                </th>

                <th className="w-[10%] px-3 py-4 text-xs font-semibold text-accent">
                  Orgánicos
                </th>

                <th className="w-[12%] px-3 py-4 text-xs font-semibold text-accent">
                  Modalidades
                </th>

                <th className="w-[11%] px-3 py-4 text-xs font-semibold text-accent">
                  Enlaces
                </th>
              </tr>
            </thead>

            <tbody>
              {negociosPagina.map(
                (negocio) => (
                  <tr
                    key={negocio.id}
                    className="
                      align-top
                      border-t border-line
                      transition
                      hover:bg-[#faf7f1]/70
                    "
                  >
                    <td className="break-words px-3 py-5">
                      <NombreNegocio
                        negocio={negocio}
                      />
                    </td>

                    <td className="break-words px-3 py-5">
                      <UbicacionesNegocio
                        negocio={negocio}
                      />
                    </td>

                    <td className="break-words px-3 py-5">
                      <ProductosNegocio
                        negocio={negocio}
                      />
                    </td>

                    <td className="break-words px-3 py-5">
                      <ContactosNegocio
                        negocio={negocio}
                      />
                    </td>

                    <td className="break-words px-3 py-5 text-xs text-muted">
                      {textoOrganicos(
                        negocio.estadoProductosOrganicos,
                      )}
                    </td>

                    <td className="break-words px-3 py-5 text-xs text-muted">
                      {negocio.modalidadesVenta.length >
                      0
                        ? negocio.modalidadesVenta.join(
                            " · ",
                          )
                        : "No informado"}
                    </td>

                    <td className="break-words px-3 py-5">
                      <EnlacesNegocio
                        negocio={negocio}
                      />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          <div
            className="
              flex items-center
              justify-between
              gap-4
              border-t border-line
              px-5 py-4
            "
          >
            <p className="text-xs text-muted">
              Página {paginaActual} de{" "}
              {totalPaginas}
            </p>

            <nav
              aria-label="Paginación de negocios"
              className="flex items-center gap-1"
            >
              {botonesPaginacion.map(
                (item, index) => {
                  if (
                    item === "ellipsis"
                  ) {
                    return (
                      <span
                        key={`ellipsis-${index}`}
                        className="px-2 text-sm text-muted"
                      >
                        ...
                      </span>
                    );
                  }

                  const activa =
                    item === paginaActual;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setPaginaActual(
                          item,
                        )
                      }
                      aria-current={
                        activa
                          ? "page"
                          : undefined
                      }
                      className={`
                        min-w-9
                        rounded-lg
                        border
                        px-3 py-2
                        text-sm
                        font-semibold
                        transition
                        ${
                          activa
                            ? "border-accent bg-accent text-white"
                            : "border-line bg-surface text-muted hover:border-accent/40 hover:text-accent"
                        }
                      `}
                    >
                      {item}
                    </button>
                  );
                },
              )}
            </nav>
          </div>
        </div>
      </div>
      );
}