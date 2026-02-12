// components/common/Pagination/Pagination.jsx
import "./Pagination.css";

const Pagination = ({ page, totalPages, onPrev, onNext, className = "" }) => {
  if (totalPages <= 1) return null;

  return (
    <div className={`pagination ${className}`}>
      <button disabled={page === 1} onClick={onPrev}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button disabled={page === totalPages} onClick={onNext}>
        Next
      </button>
    </div>
  );
};

export default Pagination;
