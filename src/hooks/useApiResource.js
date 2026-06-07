// hooks/useApiResource.js
// Shared async loading/error state machine — collapses the repeated
// try/setLoading/setError/finally skeleton duplicated across data hooks.
import { useState, useCallback } from "react";
import { getApiErrorMessage } from "../utils/apiError";

export const useApiResource = (fallbackMessage) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (task, { onError, isStale } = {}) => {
      try {
        setLoading(true);
        setError(null);
        await task();
      } catch (err) {
        if (isStale?.()) return;
        setError(getApiErrorMessage(err, fallbackMessage));
        onError?.(err);
      } finally {
        if (!isStale?.()) setLoading(false);
      }
    },
    [fallbackMessage]
  );

  return { loading, error, setError, run };
};
