"use client";

import { useEffect, useMemo, useState } from "react";
import type { Publication } from "@/data/publications";
import { PublicationCard } from "@/components/PublicationCard";
import {getPaginationItems} from "@/components/utils/utilsTool";

type PublicationsSectionProps = {
  publications: readonly  Publication[];
};

export function PublicationsSection({
  publications,
}: PublicationsSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(1);
  const [columnsPerRow, setColumnsPerRow] = useState(1);
  const [maxPageItems, setMaxPageItems] = useState(2);

  useEffect(() => {
    const updateColumns = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        setColumnsPerRow(3);
         setMaxPageItems(7);
        return;
      }

      if (window.matchMedia("(min-width: 640px)").matches) {
        setColumnsPerRow(2);
        setMaxPageItems(5);
        return;
      }

      setColumnsPerRow(1);
      setMaxPageItems(2);
    };

    updateColumns();

    window.addEventListener("resize", updateColumns);

    return () => {
      window.removeEventListener("resize", updateColumns);
    };
  }, []);

  const publicationsPerPage = rowsPerPage * columnsPerRow;

  const totalPages = Math.max(
    1,
    Math.ceil(publications.length / publicationsPerPage),
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const visiblePublications = useMemo(() => {
    const start = (currentPage - 1) * publicationsPerPage;
    const end = start + publicationsPerPage;

    return publications.slice(start, end);
  }, [publications, currentPage, publicationsPerPage]);

  function handleRowsPerPageChange(
    event: React.ChangeEvent<HTMLSelectElement>,
  ) {
    setRowsPerPage(Number(event.target.value));
    setCurrentPage(1);
  }

  const paginationItems = useMemo(
  () =>
    getPaginationItems(
      totalPages,
      currentPage,
      maxPageItems,
    ),
  [totalPages, currentPage, maxPageItems],
);

  return (
    <section
      id="publicaciones"
      aria-labelledby="publications-title"
      className="site-container border-t border-line py-12 sm:py-16"
    >
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <h2
          id="publications-title"
          className="font-display text-3xl sm:text-4xl"
        >
          Publicaciones
        </h2>

        <div className="flex items-center gap-2 text-sm text-[#6F745E]">
          <label htmlFor="rows-per-page">
            Filas por página
          </label>

          <select
            id="rows-per-page"
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
            className="rounded-lg border border-[#D8D0BE] bg-surface px-3 py-2 text-[#49633B] outline-none focus:ring-2 focus:ring-[#49633B]/30"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePublications.map((publication) => (
          <PublicationCard
            key={publication.slug}
            publication={publication}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[#D8D0BE] pt-5 sm:flex-row">
        <p className="text-sm text-[#6F745E]">
          Página{" "}
          <span className="font-semibold text-[#49633B]">
            {currentPage}
          </span>{" "}
          de {totalPages}
        </p>

        <div
          className="flex items-center gap-2"
          aria-label="Paginación de publicaciones"
        >
          <button
            type="button"
            onClick={() =>
              setCurrentPage((page) => Math.max(1, page - 1))
            }
            disabled={currentPage === 1}
            className="min-h-11 rounded-full border border-[#D8D0BE] px-4 text-sm font-semibold text-[#49633B] transition hover:bg-[#EEF0DC]/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Anterior
          </button>

         <div
            className="
                flex items-center justify-center gap-1
                max-w-[236px]
                sm:max-w-[332px]
                lg:max-w-[428px]
            "
            >
            {paginationItems.map((item) => {
                if (typeof item !== "number") {
                return (
                    <span
                    key={item}
                    aria-hidden="true"
                    className="flex h-11 min-w-11 items-center justify-center text-sm text-[#6F745E]"
                    >
                    …
                    </span>
                );
                }

                return (
                <button
                    key={item}
                    type="button"
                    onClick={() => setCurrentPage(item)}
                    aria-current={
                    currentPage === item ? "page" : undefined
                    }
                    className={
                    currentPage === item
                        ? "flex h-11 min-w-11 items-center justify-center rounded-full bg-[#49633B] px-3 text-sm font-semibold text-white"
                        : "flex h-11 min-w-11 items-center justify-center rounded-full border border-[#D8D0BE] px-3 text-sm font-semibold text-[#6F745E] transition hover:bg-[#EEF0DC]/60"
                    }
                >
                    {item}
                </button>
                );
            })}
            </div>

          <button
            type="button"
            onClick={() =>
              setCurrentPage((page) =>
                Math.min(totalPages, page + 1),
              )
            }
            disabled={currentPage === totalPages}
            className="min-h-11 rounded-full border border-[#D8D0BE] px-4 text-sm font-semibold text-[#49633B] transition hover:bg-[#EEF0DC]/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </section>
  );
}