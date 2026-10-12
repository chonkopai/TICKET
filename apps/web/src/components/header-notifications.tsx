"use client";

import type { AccountNotificationList } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NotificationInbox } from "../app/(auth)/account/notifications-panel";
import { apiRequest } from "../app/(auth)/_lib/api";
import { ACCOUNT_EXPERIENCE_COPY } from "../lib/account-experience-copy";
import { NOTIFICATIONS_COPY } from "../lib/notifications-copy";
import { localeUrl } from "../lib/locale";
import { AccountIcon } from "./account-icon";
import { useLocale } from "./locale-provider";

export function HeaderNotifications({ onDark = false }: { onDark?: boolean }) {
  const locale = useLocale();
  const copy = ACCOUNT_EXPERIENCE_COPY[locale];
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const id = useId();
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname, locale]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const load = async () => {
      if (!active) return;
      if (document.visibilityState === "visible") {
        try {
          const data = await apiRequest<AccountNotificationList>("/me/notifications?page=1&limit=1&unreadOnly=true");
          if (active) { setUnread(data.unreadCount); failures = 0; }
        } catch { failures = Math.min(failures + 1, 3); }
      }
      if (active) timer = setTimeout(load, 60_000 * (failures + 1));
    };
    const changed = (event: Event) => {
      const count = (event as CustomEvent<unknown>).detail;
      if (typeof count === "number") setUnread(count);
    };
    void load();
    window.addEventListener("event-platform:notifications-changed", changed);
    return () => { active = false; if (timer) clearTimeout(timer); window.removeEventListener("event-platform:notifications-changed", changed); };
  }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    const blur = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", blur);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", blur); };
  }, [open]);

  return <div className="ticket-navbar-notifications" ref={root}>
    <button type="button" ref={trigger} aria-label={copy.notifications} title={copy.notifications} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onClick={() => setOpen(value => !value)} className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent ${onDark ? "text-white hover:bg-white/20" : "text-slate-600 dark:text-ticket-muted hover:bg-violet-50 dark:hover:bg-ticket-accent-soft"}`}><AccountIcon name="bell" />{unread > 0 ? <span className="ticket-notification-badge">{unread > 99 ? "99+" : unread}<span className="sr-only"> {NOTIFICATIONS_COPY[locale].unreadCount}</span></span> : null}</button>
    {open ? <div className="ticket-notification-popover" id={id} role="dialog" aria-label={copy.notifications} tabIndex={-1} ref={dialog}><div className="ticket-notification-popover-actions"><Link className="account-text-link" href={localeUrl("/account?tab=notifications", locale)} onClick={() => setOpen(false)}>{NOTIFICATIONS_COPY[locale].showAll}<AccountIcon name="arrow-up-right" /></Link><button type="button" className="account-text-link" onClick={() => { setOpen(false); trigger.current?.focus(); }}>{copy.close}</button></div><NotificationInbox compact /></div> : null}
  </div>;
}
