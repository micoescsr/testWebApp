// utils/apiError.js
// Maps known machine-readable backend error codes to friendly copy.
// Generalizes the per-hook `err.response?.data?.error || err.message || "fallback"`
// chains into one place — and stops raw axios/network messages (err.message)
// from reaching the UI verbatim.
const ERROR_CODE_MESSAGES = {
  TEMP_PASSWORD_EXPIRED:
    "Temporary password has expired. Please request a new one from your administrator.",
};

/**
 * Resolve a friendly message for a failed API call.
 * Priority: known error code → server-provided message → caller fallback.
 */
export const getApiErrorMessage = (err, fallback) => {
  const code = err?.response?.data?.code;
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];

  const serverMessage = err?.response?.data?.error;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage;
  }

  return fallback;
};
