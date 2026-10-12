"use client";

import { ru } from "@event-platform/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { getSession, subscribeSession } from "../_lib/session";
import { usesStandaloneHeader } from "../../../lib/theme";
import { ThemeToggle } from "../../../components/theme-toggle";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const standalone = usesStandaloneHeader(usePathname());
  const themeControl = standalone ? <div className="flex justify-end p-3"><ThemeToggle /></div> : null;

  useEffect(() => {
    const refresh = () => setUserId(getSession()?.user.id ?? null);
    refresh();
    return subscribeSession(refresh);
  }, []);

  if (userId === undefined) return <>{themeControl}<p className="text-zinc-600 dark:text-ticket-muted">{ru.common.loading}</p></>;
  if (!userId) {
    return (
      <>{themeControl}<div className="rounded-2xl border border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-6">
        <p className="text-amber-950 dark:text-ticket-warning">{ru.auth.loginRequired}</p>
        <Link className="mt-4 inline-block font-semibold text-amber-900 dark:text-ticket-warning underline" href="/login">
          {ru.auth.goToLogin}
        </Link>
      </div></>
    );
  }
  return <Fragment key={userId}>{children}</Fragment>;
}
