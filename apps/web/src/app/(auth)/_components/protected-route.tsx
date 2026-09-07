"use client";

import { ru } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { getSession } from "../_lib/session";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => setIsAuthenticated(Boolean(getSession())), []);

  if (isAuthenticated === null) return <p className="text-zinc-600">{ru.common.loading}</p>;
  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="text-amber-950">{ru.auth.loginRequired}</p>
        <Link className="mt-4 inline-block font-semibold text-amber-900 underline" href="/login">
          {ru.auth.goToLogin}
        </Link>
      </div>
    );
  }
  return children;
}
