"use client";

import { ru } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { loadFavoriteIds, toggleFavorite } from "../lib/favorites";
import { readLocalFavoriteIds } from "../lib/local-preferences";

export function FavoriteButton({ eventId }: { eventId: string }) {
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

  return <button aria-label={favorite ? ru.publicEvent.favoriteRemove : ru.publicEvent.favoriteAdd} aria-pressed={favorite} className="absolute right-4 top-4 z-10 rounded-full bg-white/95 p-2 text-xl leading-none text-indigo-700 shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-60" disabled={busy} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void change(); }} type="button">{favorite ? "♥" : "♡"}</button>;
}
