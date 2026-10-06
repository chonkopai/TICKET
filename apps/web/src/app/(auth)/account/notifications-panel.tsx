"use client";

import { INTL_LOCALES, localeUrl } from "../../../lib/locale";

import type { AccountNotificationList, NotificationPreferences } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../_lib/api";
import { useLocale } from "../../../components/locale-provider";
import { AccountIcon } from "../../../components/account-icon";
import { ACCOUNT_REDESIGN_COPY } from "../../../lib/account-redesign-copy";
import { NOTIFICATIONS_COPY } from "../../../lib/notifications-copy";

export function NotificationsPanel({ linked, preferences, preferencesError, onRetryPreferences, busy, savingPreference, onLink, onChange }: { linked: boolean; preferences: NotificationPreferences | null; preferencesError: string | null; onRetryPreferences: () => void; busy: boolean; savingPreference: boolean; onLink: () => void; onChange: (key: keyof NotificationPreferences, value: boolean) => void }) {
  const locale = useLocale();
  const copy = NOTIFICATIONS_COPY[locale];
  const design = ACCOUNT_REDESIGN_COPY[locale];
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [list, setList] = useState<AccountNotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async (quiet = false): Promise<boolean> => {
    const current = ++generation.current;
    if (!quiet) setList(null);
    try {
      const result = await apiRequest<AccountNotificationList>(`/me/notifications?page=${page}&limit=10&unreadOnly=${unreadOnly}`);
      if (current !== generation.current) return false;
      setList(result); setError(null);
      return true;
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : copy.loadFailed);
      return false;
    }
  }, [page, unreadOnly, copy]);

  useEffect(() => {
    void reload();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") {
        failures = await reload(true) ? 0 : Math.min(failures + 1, 3);
      }
      if (alive) timer = setTimeout(poll, 30_000 * (failures + 1));
    };
    timer = setTimeout(poll, 30_000);
    const visible = () => { if (document.visibilityState === "visible") void reload(true); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; generation.current++; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [reload]);

  async function read(id: string): Promise<void> {
    if (reading) return;
    setReading(id); setError(null);
    try { await apiRequest<{ readAt: string }>(`/me/notifications/${id}/read`, { method: "PATCH" }); await reload(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : copy.readFailed); }
    finally { setReading(null); }
  }

  return <div className="account-notifications">
    <section className="account-card account-bot"><span className="account-symbol"><AccountIcon name="send" /></span><div className="account-bot-content"><div><h2>{linked ? copy.linked : design.botTitle}</h2><span className="account-bot-status">{linked ? copy.active : design.unlinked}</span></div><p>{copy.botHint}</p></div>{!linked ? <button className="account-button account-button-primary" disabled={busy} onClick={onLink} type="button"><AccountIcon name="arrow-up-right" />{copy.connectBot}</button> : null}</section>
    <div className="account-notification-columns">
      <section className="account-card account-preferences"><h2>{copy.settings}</h2><p>{design.settingsHint}</p>{preferences ? <>
        <Toggle label={copy.ticketDelivery} description={copy.ticketDeliveryHint} checked={preferences.transactionalTicketDelivery} disabled={savingPreference} onChange={value => onChange("transactionalTicketDelivery", value)} />
        <Toggle label={copy.reminders} description={copy.remindersHint} checked={preferences.eventReminders} disabled={savingPreference} onChange={value => onChange("eventReminders", value)} />
        <Toggle label={copy.marketing} description={design.marketingHint} checked={preferences.marketingAnnouncements} disabled={savingPreference} onChange={value => onChange("marketingAnnouncements", value)} />
      </> : preferencesError ? <div className="account-resource-error" role="alert"><p>{preferencesError}</p><button className="account-text-link" type="button" onClick={onRetryPreferences}>{design.retry}</button></div> : <p role="status">{copy.loading}</p>}<div className="account-preferences-note"><AccountIcon name="info" /><p>{copy.settingsHint}</p></div></section>
      <section className="account-card account-inbox"><div className="account-inbox-toolbar"><h2>{copy.inbox}{list?.unreadCount ? <span className="account-muted"> · {list.unreadCount}</span> : null}</h2><label><input type="checkbox" checked={unreadOnly} onChange={event => { setUnreadOnly(event.target.checked); setPage(1); }} />{copy.unreadOnly}</label></div>
        {error && !list ? <div className="account-inbox-error" role="alert"><span className="account-error-symbol"><AccountIcon name="cloud-alert" /></span><div><h3>{copy.loadFailed}</h3><p>{design.inboxErrorHint}</p><p className="account-error-detail">{error}</p></div><button className="account-button" type="button" onClick={() => void reload()}><AccountIcon name="refresh-cw" />{design.retry}</button></div> : <>
          {error ? <div className="account-resource-error" role="alert"><p>{error}</p><button className="account-text-link" type="button" onClick={() => void reload()}>{design.retry}</button></div> : null}
          {!list ? <p className="account-loading" role="status">{copy.loading}</p> : list.items.length ? <div className="account-inbox-list">{list.items.map(item => <article className="account-notification" key={item.id}><h3>{item.eventTitle || "TICKET"}{!item.readAt ? <span className="account-unread-dot" aria-label={copy.unread} /> : null}</h3><p>{item.text}</p><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time><div className="account-notification-actions">{item.eventId ? <Link className="account-text-link" href={localeUrl(item.type === "event.cancellation" || item.type === "refund.succeeded" ? "/account?tab=tickets" : `/events/${item.eventId}`, locale)}>{item.type === "event.cancellation" || item.type === "refund.succeeded" ? copy.myTickets : copy.event}</Link> : null}{!item.readAt ? <button className="account-text-link" disabled={reading !== null} type="button" onClick={() => void read(item.id)}>{copy.markRead}</button> : null}</div></article>)}</div> : <p className="account-loading">{unreadOnly ? copy.noUnread : copy.empty}</p>}
          {list && list.total > list.limit ? <nav className="account-pager" aria-label={copy.pages}><button className="account-button" disabled={page === 1} type="button" onClick={() => setPage(page - 1)}>{copy.back}</button><span>{page}</span><button className="account-button" disabled={!list.hasNext} type="button" onClick={() => setPage(page + 1)}>{copy.next}</button></nav> : null}
        </>}
      </section>
    </div>
  </div>;
}

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <button className="account-toggle" type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span><strong>{label}</strong><small>{description}</small></span><span aria-hidden="true" className={`account-switch ${checked ? "is-checked" : ""}`}><span /></span></button>;
}
