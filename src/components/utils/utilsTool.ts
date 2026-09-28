type PaginationItem =
  | number
  | "ellipsis-left"
  | "ellipsis-right"
  | "empty";

export function getPaginationItems(
  totalPages: number,
  currentPage: number,
  maxItems: number,
): PaginationItem[] {
  if (totalPages <= maxItems) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const middleSlots = maxItems - 4;

  // Estamos cerca del comienzo.
  if (currentPage <= Math.ceil(maxItems / 2)) {
    const visiblePages = Array.from(
      { length: maxItems - 2 },
      (_, index) => index + 1,
    );

    return [
      ...visiblePages,
      "ellipsis-right",
      totalPages,
    ];
  }

  // Estamos cerca del final.
  if (
    currentPage >=
    totalPages - Math.floor(maxItems / 2)
  ) {
    const start = totalPages - (maxItems - 3);

    const visiblePages = Array.from(
      { length: maxItems - 2 },
      (_, index) => start + index,
    );

    return [
      1,
      "ellipsis-left",
      ...visiblePages,
    ];
  }

  // Estamos en el medio.
  const half = Math.floor(middleSlots / 2);

  const start = currentPage - half;
  const end =
    currentPage + (middleSlots - half - 1);

  const middlePages = Array.from(
    { length: end - start + 1 },
    (_, index) => start + index,
  );

  if (middlePages.length > 0) { 
     return [
        1,
        "ellipsis-left",
        ...middlePages,
        "ellipsis-right",
        totalPages,
    ];
  }

   else { 
    return [
        1,
        "empty",
        ...middlePages,
        "ellipsis-right",
        totalPages,
    ];
  }

}