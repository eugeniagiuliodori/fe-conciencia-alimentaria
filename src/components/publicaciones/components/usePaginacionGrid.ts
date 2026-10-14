"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { getPaginationItems } from "@/components/utils/utilsTool";

export type PaginationItem =
  ReturnType<
    typeof getPaginationItems
  >[number];

export type RangoDatos = {
  offset: number;
  limit: number;
};

type UsePaginacionGridParams = {
  totalItems: number;
  filasIniciales?: number;
};

export function usePaginacionGrid({
  totalItems,
  filasIniciales = 1,
}: UsePaginacionGridParams) {
  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [
    rowsPerPage,
    setRowsPerPage,
  ] = useState(filasIniciales);

  const [
    columnsPerRow,
    setColumnsPerRow,
  ] = useState(1);

  const [
    maxPageItems,
    setMaxPageItems,
  ] = useState(2);

  const [
    responsiveReady,
    setResponsiveReady,
  ] = useState(false);

  /*
   * Mantener sincronizado con:
   * grid
   * sm:grid-cols-2  -> 640 px
   * lg:grid-cols-3  -> 1024 px
   */
  useEffect(() => {
    const mediaSm =
      window.matchMedia(
        "(min-width: 640px)",
      );

    const mediaLg =
      window.matchMedia(
        "(min-width: 1024px)",
      );

    function actualizarResponsive() {
      if (mediaLg.matches) {
        setColumnsPerRow(3);
        setMaxPageItems(7);
      } else if (mediaSm.matches) {
        setColumnsPerRow(2);
        setMaxPageItems(5);
      } else {
        setColumnsPerRow(1);
        setMaxPageItems(2);
      }

      setResponsiveReady(true);
    }

    actualizarResponsive();

    mediaSm.addEventListener(
      "change",
      actualizarResponsive,
    );

    mediaLg.addEventListener(
      "change",
      actualizarResponsive,
    );

    return () => {
      mediaSm.removeEventListener(
        "change",
        actualizarResponsive,
      );

      mediaLg.removeEventListener(
        "change",
        actualizarResponsive,
      );
    };
  }, []);

  const itemsPerPage =
    rowsPerPage * columnsPerRow;

  const totalPages = Math.max(
    1,
    Math.ceil(
      totalItems / itemsPerPage,
    ),
  );

  /*
   * Al cambiar el ancho de pantalla puede cambiar la
   * cantidad de columnas y, por lo tanto, totalPages.
   */
  useEffect(() => {
    setCurrentPage((page) =>
      Math.min(page, totalPages),
    );
  }, [totalPages]);

  /*
   * La UI expresa su necesidad como página/filas/columnas.
   * El acceso a datos queda desacoplado mediante offset/limit.
   */
  const rango = useMemo<RangoDatos>(
    () => ({
      offset:
        (currentPage - 1) *
        itemsPerPage,
      limit: itemsPerPage,
    }),
    [
      currentPage,
      itemsPerPage,
    ],
  );

  const paginationItems =
    useMemo(
      () =>
        getPaginationItems(
          totalPages,
          currentPage,
          maxPageItems,
        ),
      [
        totalPages,
        currentPage,
        maxPageItems,
      ],
    );

  function cambiarFilasPorPagina(
    cantidad: number,
  ) {
    setRowsPerPage(cantidad);
    setCurrentPage(1);
  }

  function mostrarAnterior() {
    setCurrentPage((page) =>
      Math.max(1, page - 1),
    );
  }

  function mostrarSiguiente() {
    setCurrentPage((page) =>
      Math.min(
        totalPages,
        page + 1,
      ),
    );
  }

  return {
    currentPage,
    rowsPerPage,
    columnsPerRow,
    itemsPerPage,
    totalPages,
    paginationItems,
    rango,
    responsiveReady,
    setCurrentPage,
    cambiarFilasPorPagina,
    mostrarAnterior,
    mostrarSiguiente,
  };
}
