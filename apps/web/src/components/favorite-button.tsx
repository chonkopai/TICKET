"use client";

import { ru } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { loadFavoriteIds, toggleFavorite } from "../lib/favorites";
import { readLocalFavoriteIds } from "../lib/local-preferences";

export function FavoriteButton({ eventId, compact = false, heroOverlay = false }: { eventId: string; compact?: boolean; heroOverlay?: boolean }) {
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void loadFavoriteIds().then((ids) => { if (active) setFavorite(ids.has(eventId)); }).catch(() => {
      if (active) setFavorite(readLocalFavoriteIds().includes(eventId));
    });
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ eventId?: string; favorite?: boolean }>).detail;
      if (detail?.eventId === eventId && typeof detail.favorite === "boolean") setFavorite(detail.favorite);
      else setFavorite(readLocalFavoriteIds().includes(eventId));
    };
    window.addEventListener("event-platform:favorites-changed", refresh);
    return () => { active = false; window.removeEventListener("event-platform:favorites-changed", refresh); };
  }, [eventId]);

  async function change(): Promise<void> {
    if (busy) return;
    const next = !favorite;
    setBusy(true);
    setFavorite(next);
    try {
      await toggleFavorite(eventId, next);
      window.dispatchEvent(new CustomEvent("event-platform:favorites-changed", { detail: { eventId, favorite: next } }));
    } catch {
      setFavorite(!next);
    } finally { setBusy(false); }
  }

  return <button aria-label={favorite ? ru.publicEvent.favoriteRemove : ru.publicEvent.favoriteAdd} aria-pressed={favorite} className={`absolute z-10 flex items-center justify-center rounded-full text-white transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white dark:focus-visible:ring-ticket-surface disabled:opacity-60 ${compact ? "right-2 top-1 size-9" : heroOverlay ? "right-4 top-4 size-11 sm:right-8 lg:right-10" : "right-4 top-4 size-11"}`} disabled={busy} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void change(); }} type="button">{<svg aria-hidden="true" className={`${compact ? "h-5 w-5" : "h-6 w-6"} drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]`} viewBox="0 0 24 24" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>}</button>;
}
