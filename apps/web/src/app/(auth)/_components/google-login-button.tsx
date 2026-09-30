"use client";

import type { AuthResponse } from "@event-platform/shared-types";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../../components/locale-provider";
import { apiRequest } from "../_lib/api";
import { publicAuthRequest, safeReturnPath } from "../_lib/public-auth";
import { saveSession } from "../_lib/session";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const COPY = {
  ru: { unavailable: "Google недоступен. Попробуйте другой способ входа.", loading: "Загрузка…", busy: "Подключение…", retry: "Повторить", link: "Подключить Google" },
  kk: { unavailable: "Google қолжетімсіз. Басқа кіру тәсілін таңдаңыз.", loading: "Жүктелуде…", busy: "Қосылуда…", retry: "Қайталау", link: "Google қосу" },
  en: { unavailable: "Google is unavailable. Try another sign-in method.", loading: "Loading…", busy: "Connecting…", retry: "Retry", link: "Connect Google" },
};
type GoogleApi = { initialize: (options: { client_id: string; nonce: string; auto_select: boolean; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, string | number>) => void };
declare global { interface Window { google?: { accounts: { id: GoogleApi } } } }

export function GoogleLoginButton({ link = false, onLinked }: { link?: boolean; onLinked?: () => void } = {}) {
  const locale = useLocale();
  const copy = COPY[locale];
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onLinked);
  callback.current = onLinked;
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !CLIENT_ID || !host.current) return;
    let active = true;
    let submitting = false;
    const element = host.current;
    setRendered(false);
    const setup = async () => {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
      const nonce = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!active || !window.google) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, nonce, auto_select: false, callback: response => {
        if (!active || submitting) return;
        submitting = true;
        setBusy(true); setError(null);
        void (async () => {
          const body = { credential: response.credential, secret };
          if (link) {
            await apiRequest("/me/identities/google", { method: "POST", body: JSON.stringify(body) });
            if (active) callback.current?.();
          } else {
            const session = await publicAuthRequest<AuthResponse>("/auth/google", body);
            if (!active) return;
            saveSession(session);
            router.replace(safeReturnPath());
          }
        })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : copy.unavailable); }).finally(() => {
          if (active) { setBusy(false); setAttempt(value => value + 1); }
        });
      } });
      element.replaceChildren();
      window.google.accounts.id.renderButton(element, { type: "icon", theme: "outline", size: "large", shape: "circle", locale });
      setRendered(true);
    };
    void setup().catch(() => { if (active) setError(copy.unavailable); });
    return () => { active = false; element.replaceChildren(); };
  }, [ready, attempt, link, router, locale, copy.unavailable]);

  if (!CLIENT_ID) return null;
  return <div className="min-w-0 rounded-xl border border-[#e5eeff] bg-[#eff4ff] p-2 text-center">
    <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} onError={() => setError(copy.unavailable)} />
    <div className={busy ? "pointer-events-none flex justify-center opacity-50" : "flex justify-center"} ref={host} />
    <span className="block text-xs font-semibold">{link ? copy.link : "Google"}</span>
    {!rendered && !error ? <span className="text-xs">{copy.loading}</span> : null}
    {busy ? <p className="text-xs" role="status">{copy.busy}</p> : null}
    {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
    {error && ready ? <button type="button" className="mt-1 text-xs underline" onClick={() => { setError(null); setAttempt(value => value + 1); }}>{copy.retry}</button> : null}
  </div>;
}
