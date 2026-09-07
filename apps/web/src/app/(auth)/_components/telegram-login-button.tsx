"use client";

import { ru, type AuthResponse, type TelegramLoginPayload } from "@event-platform/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { saveSession } from "../_lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginPayload) => void;
  }
}

export function TelegramLoginButton({ onAuthenticated }: { onAuthenticated?: () => void } = {}) {
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!BOT_USERNAME || !container.current) {
      setError(ru.auth.notConfigured);
      return;
    }

    window.onTelegramAuth = (user): void => {
      void (async () => {
        setError(null);
        const response = await fetch(new URL("/auth/telegram/widget", API_URL), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(user),
        });
        if (!response.ok) {
          setError(ru.auth.verificationFailed);
          return;
        }
        saveSession((await response.json()) as AuthResponse);
        if (onAuthenticated) onAuthenticated();
        else router.replace("/account");
      })().catch(() => setError(ru.auth.unavailable));
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.dataset.telegramLogin = BOT_USERNAME;
    script.dataset.size = "large";
    script.dataset.userpic = "true";
    script.dataset.requestAccess = "write";
    script.dataset.onauth = "onTelegramAuth(user)";
    container.current.replaceChildren(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [router, onAuthenticated]);

  return (
    <div>
      <div ref={container} />
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
