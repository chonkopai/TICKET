"use client";

import { ru } from "@event-platform/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { getSession } from "../_lib/session";
import { usesStandaloneHeader } from "../../../lib/theme";
import { ThemeToggle } from "../../../components/theme-toggle";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const standalone = usesStandaloneHeader(usePathname());
  const themeControl = standalone ? <div className="flex justify-end p-3"><ThemeToggle /></div> : null;

  useEffect(() => setIsAuthenticated(Boolean(getSession())), []);

  if (isAuthenticated === null) return <>{themeControl}<p className="text-zinc-600 dark:text-ticket-muted">{ru.common.loading}</p></>;
  if (!isAuthenticated) {
    return (
      <>{themeControl}<div className="rounded-2xl border border-amber-200 dark:border-ticket-warning-border bg-amber-50 dark:bg-ticket-warning-soft p-6">
        <p className="text-amber-950 dark:text-ticket-warning">{ru.auth.loginRequired}</p>
        <Link className="mt-4 inline-block font-semibold text-amber-900 dark:text-ticket-warning underline" href="/login">
          {ru.auth.goToLogin}
        </Link>
      </div></>
    );
  }
  return children;
}
