"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";

/** Each section fails independently. Requests never overlap and stop when hidden/unmounted. */
export function useAccountResource<T>(path: string | null, poll = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setData(null); setError(null);
    if (!path) return;
    let alive = true;
    let loading = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!alive || loading) return;
      if (timer) clearTimeout(timer);
      loading = true;
      try {
        const result = await apiRequest<T>(path);
        if (alive) { setData(result); setError(null); failures = 0; }
      } catch (reason) {
        if (alive) { setError(reason instanceof Error ? reason.message : String(reason)); failures = Math.min(failures + 1, 3); }
      } finally {
        loading = false;
        if (alive && poll) timer = setTimeout(tick, 30_000 * (failures + 1));
      }
    };
    const tick = () => {
      if (document.visibilityState === "visible") void load();
      else if (alive && poll) timer = setTimeout(tick, 30_000);
    };
    const visible = () => { if (document.visibilityState === "visible" && poll) void load(); };
    void load();
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [path, poll, attempt]);
  return { data, setData, error, retry: () => setAttempt(value => value + 1) };
}
