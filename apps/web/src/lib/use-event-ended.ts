"use client";

import { eventExpiryTime, hasEventEnded } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

/** Update open ticket cards/dialogs at the cutoff, including after a hidden tab resumes. */
export function useEventEnded(event: { startsAt?: string | undefined; endsAt?: string | null | undefined }) {
  const [, refresh] = useState(0);
  const { startsAt, endsAt } = event;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (timer) clearTimeout(timer);
      refresh(value => value + 1);
      const remaining = eventExpiryTime({ startsAt, endsAt }) - Date.now();
      if (remaining > 0) timer = setTimeout(update, Math.min(remaining + 1, 2_147_483_647));
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", update); };
  }, [startsAt, endsAt]);
  return hasEventEnded(event);
}
