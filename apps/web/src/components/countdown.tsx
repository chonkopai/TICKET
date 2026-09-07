"use client";

import { ru } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { formatCountdown } from "../lib/countdown";

export function Countdown({ startsAt, past = false }: { startsAt: string; past?: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [startsAt]);

  if (past) return <span className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold">{ru.guest.past}</span>;
  const target = new Date(startsAt).getTime();
  const remainingSeconds = Number.isFinite(target) ? Math.floor((target - now) / 1000) : 0;
  const formatted = formatCountdown(remainingSeconds);
  if (!formatted) return null;
  return <span className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{ru.countdown.label}: {formatted}</span>;
}
