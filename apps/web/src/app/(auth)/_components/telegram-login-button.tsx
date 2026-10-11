"use client";

import type { AuthResponse, TelegramLoginPayload } from "@event-platform/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getSession, saveSession } from "../_lib/session";
import { safeReturnPath } from "../_lib/public-auth";
import { TELEGRAM_AUTH_COPY } from "../_lib/telegram-auth-copy";
import { useLocale } from "../../../components/locale-provider";
import { localeUrl } from "../../../lib/locale";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

declare global {
  interface Window {
    eventPlatformTelegramCallbacks?: Record<string, (user: TelegramLoginPayload) => void>;
  }
}

export function TelegramLoginButton({ onAuthenticated }: { onAuthenticated?: () => void } = {}) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const copy = TELEGRAM_AUTH_COPY[locale];

  useEffect(() => {
    if (!BOT_USERNAME || !container.current) {
      setError(copy.notConfigured);
      return;
    }

    const callbackName = `cb_${crypto.randomUUID().replaceAll("-", "")}`;
    const callbacks = window.eventPlatformTelegramCallbacks ??= {};
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    let finished = false;
    const returnTo = localeUrl(safeReturnPath(), locale);
    callbacks[callbackName] = (user): void => {
      if (!active || inFlight || finished) return;
      inFlight = true;
      const sessionBefore = getSession()?.tokens.accessToken;
      void (async () => {
        setError(null);
        const response = await fetch(new URL("/auth/telegram/widget", API_URL), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(user),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) {
          setError(copy.failed);
          return;
        }
        const session = await response.json() as AuthResponse;
        if (!active || getSession()?.tokens.accessToken !== sessionBefore) return;
        finished = true;
        saveSession(session);
        if (onAuthenticated) onAuthenticated();
        else router.replace(returnTo);
      })().catch(() => { if (active) setError(copy.unavailable); }).finally(() => { inFlight = false; });
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = BOT_USERNAME;
    script.dataset.size = "large";
    script.dataset.userpic = "true";
    script.dataset.requestAccess = "write";
    // A late iframe message after unmount must also be harmless after its callback is removed.
    script.dataset.onauth = `window.eventPlatformTelegramCallbacks?.${callbackName}?.(user)`;
    script.onerror = () => { if (active) setError(copy.unavailable); };
    container.current.replaceChildren(script);

    return () => {
      active = false;
      controller.abort();
      delete callbacks[callbackName];
      script.remove();
    };
  }, [router, onAuthenticated, copy, locale]);

  return (
    <div>
      <div ref={container} />
      {error ? <p role="alert" className="mt-4 text-sm text-red-700 dark:text-ticket-danger">{error}</p> : null}
    </div>
  );
}
