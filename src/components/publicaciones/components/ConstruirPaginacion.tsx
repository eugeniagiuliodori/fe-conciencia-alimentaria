"use client";

import type {
  PaginationItem,
} from "./usePaginacionGrid";

type ConstruirPaginacionProps = {
  currentPage: number;
  totalPages: number;
  paginationItems: PaginationItem[];
  cargando?: boolean;
  onPageChange: (
    page: number,
  ) => void;
  onAnterior: () => void;
  onSiguiente: () => void;
};

export function ConstruirPaginacion({
  currentPage,
  totalPages,
  paginationItems,
  cargando = false,
  onPageChange,
  onAnterior,
  onSiguiente,
}: ConstruirPaginacionProps) {
  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#D8D0BE] pt-5 sm:flex-row">
      <p className="text-sm text-[#6F745E]">
        Página{" "}
        <span className="font-semibold text-[#49633B]">
          {currentPage}
        </span>{" "}
        de {totalPages}
      </p>

      <nav
        className="flex items-center gap-2"
        aria-label="Paginación de publicaciones"
      >
        <button
          type="button"
          onClick={onAnterior}
          disabled={
            cargando ||
            currentPage === 1
          }
          className="min-h-11 rounded-full border border-[#D8D0BE] px-4 text-[10px] font-semibold text-[#49633B] transition hover:bg-[#EEF0DC]/60 disabled:cursor-not-allowed disabled:opacity-40 md:text-sm"
        >
          ← Anterior
        </button>

        <div
          className="
            flex max-w-[236px] items-center justify-center gap-1
            sm:max-w-[332px]
            lg:max-w-[428px]
          "
        >
          {paginationItems.map(
            (item, index) => {
              if (
                typeof item !== "number"
              ) {
                if (item === "empty") {
                  return null;
                }

                return (
                  <span
                    key={`${String(item)}-${index}`}
                    aria-hidden="true"
                    className="flex h-11 min-w-11 items-center justify-center text-sm text-[#6F745E]"
                  >
                    …
                  </span>
                );
              }

              const activa =
                currentPage === item;

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    onPageChange(item)
                  }
                  disabled={
                    cargando || activa
                  }
                  aria-current={
                    activa
                      ? "page"
                      : undefined
                  }
                  className={
                    activa
                      ? "flex h-11 min-w-11 items-center justify-center rounded-full bg-[#49633B] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed"
                      : "flex h-11 min-w-11 items-center justify-center rounded-full border border-[#D8D0BE] px-3 text-sm font-semibold text-[#6F745E] transition hover:bg-[#EEF0DC]/60 disabled:cursor-not-allowed disabled:opacity-40"
                  }
                >
                  {item}
                </button>
              );
            },
          )}
        </div>

        <button
          type="button"
          onClick={onSiguiente}
          disabled={
            cargando ||
            currentPage === totalPages
          }
          className="min-h-11 rounded-full border border-[#D8D0BE] px-4 text-[10px] font-semibold text-[#49633B] transition hover:bg-[#EEF0DC]/60 disabled:cursor-not-allowed disabled:opacity-40 md:text-sm"
        >
          Siguiente →
        </button>
      </nav>
    </div>
  );
}
