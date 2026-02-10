//hooks/usePagination.js
import { useState, useMemo } from "react";

export const usePagination = (items = [], itemsPerPage = 10) => {
  const [page, setPage] = useState(1);

  const totalPages = useMemo(
    () => Math.ceil((items?.length || 0) / itemsPerPage),
    [items, itemsPerPage]
  );

  const currentItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, page, itemsPerPage]);

  const goToPage = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  const goNext = () => goToPage(page + 1);
  const goPrev = () => goToPage(page - 1);

  const resetPage = () => setPage(1);

  return {
    page,
    totalPages,
    currentItems,
    goToPage,
    goNext,
    goPrev,
    resetPage,
  };
};
