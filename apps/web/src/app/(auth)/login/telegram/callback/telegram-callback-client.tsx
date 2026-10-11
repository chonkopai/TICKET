"use client";

import type { TelegramOidcCompleteResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../../../../components/locale-provider";
import { localeUrl } from "../../../../../lib/locale";
import { saveSession } from "../../../_lib/session";
import { completeTelegramLogin, pendingTelegramLogin } from "../../../_lib/telegram-oidc";
import { TELEGRAM_AUTH_COPY } from "../../../_lib/telegram-auth-copy";

export function TelegramCallbackClient() {
  const locale = useLocale();
  const copy = TELEGRAM_AUTH_COPY[locale];
  const router = useRouter();
  const completion = useRef<Promise<TelegramOidcCompleteResponse> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    let active = true;
    if (!completion.current) {
      const attempt = pendingTelegramLogin();
      setReturnTo(attempt?.returnTo ?? localeUrl("/", locale));
      const search = window.location.search;
      // Remove code/state before other navigation; a reload safely asks for a new attempt.
      window.history.replaceState(window.history.state, "", localeUrl("/login/telegram/callback", attempt?.locale ?? locale));
      completion.current = completeTelegramLogin(search);
    }
    // Reuse the same promise across Strict Mode effects; never exchange a code twice.
    void completion.current.then(result => {
      if (!active) return;
      saveSession(result.session);
      router.replace(result.returnTo);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : copy.failed); });
    return () => { active = false; };
  }, [copy.failed, locale, router]);

  const restart = localeUrl(`/login?returnTo=${encodeURIComponent(returnTo)}`, locale);
  return <main className="min-h-svh bg-white dark:bg-ticket-surface px-5 py-16 text-[#0b1c30] dark:text-ticket-text">
    <section className="mx-auto max-w-md rounded-2xl border border-[#e5eeff] dark:border-ticket-border p-6" aria-labelledby="telegram-callback-title">
      <h1 id="telegram-callback-title" className="text-2xl font-bold">{copy.title}</h1>
      {error ? <>
        <p role="alert" className="mt-4 text-red-700 dark:text-ticket-danger">{error}</p>
        <Link className="mt-5 block min-h-11 rounded-xl bg-[#6320ee] px-4 py-3 text-center font-semibold text-white" href={restart}>{copy.retry}</Link>
        <Link className="mt-3 block min-h-11 py-3 text-center underline underline-offset-2" href={`${restart}&telegram=phone`}>{copy.phone}</Link>
      </> : <p className="mt-4" role="status">{copy.verifying}</p>}
      <Link className="mt-4 inline-block min-h-11 py-3 text-sm underline underline-offset-2" href={restart}>{copy.back}</Link>
    </section>
  </main>;
}
