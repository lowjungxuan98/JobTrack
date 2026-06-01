"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePolling<T>(
  load: () => Promise<T>,
  intervalMs: number,
  initialValue: T,
): { data: T; error: string | null; refresh: () => Promise<void> } {
  const active = useRef(false);
  const [data, setData] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      if (!active.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (active.current) setError((e as Error).message);
    }
  }, [load]);

  useEffect(() => {
    active.current = true;
    const first = setTimeout(() => {
      void refresh();
    }, 0);
    const interval = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      active.current = false;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [intervalMs, refresh]);

  return { data, error, refresh };
}
