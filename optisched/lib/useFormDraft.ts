"use client";

import { useSyncExternalStore, useCallback, useMemo } from "react";

interface DraftOptions<T> {
  formId: string;
  userId?: string | null;
  initialValues: T;
  maxAgeMs?: number; // Defaults to 24 hours
}

interface DraftPayload<T> {
  data: T;
  timestamp: number;
}

// In-memory event listeners for intra-tab synchronization
const listeners = new Set<() => void>();
function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

/**
 * Hook for safe form draft persistence using React 18/19 useSyncExternalStore.
 *
 * Rules:
 * - Isolated by authenticated user ID and form identifier.
 * - Server snapshot returns null, guaranteeing zero Next.js hydration mismatches.
 * - Synchronous subscription avoids cascading renders (react-hooks/set-state-in-effect compliant).
 * - Excludes passwords and sensitive credentials (caller stores only non-sensitive form state).
 * - Expiration checked during snapshot retrieval to maintain pure render semantics (react-hooks/purity compliant).
 */
export function useFormDraft<T extends Record<string, unknown>>({
  formId,
  userId,
  initialValues,
  maxAgeMs = 24 * 60 * 60 * 1000,
}: DraftOptions<T>) {
  const storageKey = `optisched_draft_${userId || "anon"}_${formId}`;

  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem(storageKey);
          if (!stored) return null;
          const parsed = JSON.parse(stored);
          if (
            parsed &&
            typeof parsed === "object" &&
            typeof parsed.timestamp === "number" &&
            Date.now() - parsed.timestamp <= maxAgeMs
          ) {
            return stored;
          }
          // Expired
          localStorage.removeItem(storageKey);
          return null;
        }
        return null;
      } catch {
        return null;
      }
    },
    () => null // Hydration safe: server snapshot is always null
  );

  const draft = useMemo(() => {
    if (!raw) return null;
    try {
      const parsed: DraftPayload<T> = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.data) {
        return parsed.data;
      }
    } catch {
      // Corrupt draft
    }
    return null;
  }, [raw]);

  const hasRestoredDraft = Boolean(draft);

  const saveDraft = useCallback(
    (updates: Partial<T>) => {
      try {
        if (typeof window !== "undefined") {
          const currentRaw = localStorage.getItem(storageKey);
          let currentData: T = initialValues;
          if (currentRaw) {
            try {
              const parsed = JSON.parse(currentRaw);
              if (parsed?.data) {
                currentData = { ...initialValues, ...parsed.data };
              }
            } catch {}
          }
          const updatedData = { ...currentData, ...updates };
          const payload: DraftPayload<T> = {
            data: updatedData,
            timestamp: Date.now(),
          };
          localStorage.setItem(storageKey, JSON.stringify(payload));
          notifyListeners();
        }
      } catch {
        // Handle storage quota or private-browsing restrictions silently
      }
    },
    [storageKey, initialValues]
  );

  const clearDraft = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
        notifyListeners();
      }
    } catch {}
  }, [storageKey]);

  return {
    draft,
    hasRestoredDraft,
    saveDraft,
    clearDraft,
  };
}
