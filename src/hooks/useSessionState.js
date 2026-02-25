// hooks/useSessionState.js
// Drop-in replacement for useState that syncs with sessionStorage.
// - Survives page refresh within the same tab
// - Auto-clears when the tab closes (sessionStorage is tab-scoped)
// - JSON-safe: serializes/deserializes values; falls back to initialValue on parse error
// - Functional setState support: setValue(prev => next) works
// - SSR/build safe: guards against missing `window`
//
// Key convention: all keys should be prefixed with "wf:" to avoid collisions.

import { useState, useCallback } from "react";

const HAS_STORAGE =
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

/**
 * Read a key from sessionStorage, JSON-parse it, and return the value.
 * Returns `fallback` if the key is missing, empty, or unparseable.
 */
function readStorage(key, fallback) {
  if (!HAS_STORAGE) return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return fallback;

    const envelope = JSON.parse(raw);
    // Versioned envelope: { v: 1, value: ... }
    if (envelope && typeof envelope === "object" && "v" in envelope) {
      return envelope.value ?? fallback;
    }
    // Legacy / raw value — treat as direct
    return envelope;
  } catch {
    // Corrupt data — wipe it and fall back
    try { window.sessionStorage.removeItem(key); } catch { /* noop */ }
    return fallback;
  }
}

/**
 * Write a value to sessionStorage inside a versioned envelope.
 * `undefined` is normalized to `null` to stay JSON-safe.
 */
function writeStorage(key, value) {
  if (!HAS_STORAGE) return;
  try {
    const safeValue = value === undefined ? null : value;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ v: 1, value: safeValue })
    );
  } catch (err) {
    // Storage full or blocked — fail silently; state still works in-memory
    console.warn(`[useSessionState] write failed for key "${key}":`, err);
  }
}

/**
 * Remove a key from sessionStorage.
 */
function removeStorage(key) {
  if (!HAS_STORAGE) return;
  try { window.sessionStorage.removeItem(key); } catch { /* noop */ }
}

// ── Public API ──────────────────────────────────────────

/**
 * useSessionState(key, initialValue)
 *
 * Works exactly like useState, but the value is persisted in sessionStorage
 * under `key`. On mount, reads from storage (if present) instead of using
 * `initialValue`. On every set, writes through to storage.
 *
 * @param {string} key          sessionStorage key (use "wf:" prefix)
 * @param {*}      initialValue default when nothing is stored
 * @returns {[*, Function]}     [value, setValue] — same as useState
 */
export function useSessionState(key, initialValue) {
  const [state, setStateRaw] = useState(() => readStorage(key, initialValue));

  const setState = useCallback(
    (action) => {
      setStateRaw((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        writeStorage(key, next);
        return next;
      });
    },
    [key]
  );

  return [state, setState];
}

/**
 * Clear ALL session-state keys (those prefixed with "wf:").
 * Call on logout to prevent stale data leaking into the next session.
 */
export function clearSessionState() {
  if (!HAS_STORAGE) return;
  const toRemove = [];
  for (let i = 0; i < window.sessionStorage.length; i++) {
    const k = window.sessionStorage.key(i);
    if (k && k.startsWith("wf:")) toRemove.push(k);
  }
  toRemove.forEach((k) => removeStorage(k));
}
