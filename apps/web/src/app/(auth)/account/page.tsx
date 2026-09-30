"use client";

import { INTL_LOCALES, localeFromBrowser, localeUrl } from "../../../lib/locale";

import { type AccountDashboard, type AccountOrderList, type AuthUser, type EventLocale, type GuestEventList, type NotificationPreferences, type TelegramLinkTokenResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { GuestEventCard } from "../../../components/guest-event-card";
import { PageShell } from "../../../components/ui";
import { ProtectedRoute } from "../_components/protected-route";
import { apiRequest } from "../_lib/api";
import { getSession, updateSessionUser } from "../_lib/session";
import { NotificationsPanel } from "./notifications-panel";
import { LoginMethodsPanel } from "./login-methods-panel";
import { useLocale } from "../../../components/locale-provider";
import { ACCOUNT_COPY } from "../../../lib/account-copy";

type AccountTab = "tickets" | "profile" | "notifications" | "payments";
const TABS: AccountTab[] = ["tickets", "profile", "notifications", "payments"];

export default function AccountPage() {
  return <PageShell className="max-w-7xl"><ProtectedRoute><Account /></ProtectedRoute></PageShell>;
}

function Account() {
  const locale = useLocale();
  const copy = ACCOUNT_COPY[locale];
  const [user, setUser] = useState<AuthUser | null>(() => getSession()?.user ?? null);
  const [dashboard, setDashboard] = useState<AccountDashboard | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [events, setEvents] = useState<GuestEventList | null>(null);
  const [orders, setOrders] = useState<AccountOrderList | null>(null);
  const [tab, setTab] = useState<AccountTab>("tickets");
  const [eventStatus, setEventStatus] = useState<"upcoming" | "past">("upcoming");
  const [eventPage, setEventPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [defaultCity, setDefaultCity] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "profile") setTab("profile"); }, []);

  const refreshUser = useCallback(() => {
    void apiRequest<AuthUser>("/me").then(profile => { setUser(profile); updateSessionUser(profile); }).catch(showError(setMessage));
  }, []);

  useEffect(() => {
    Promise.all([apiRequest<AuthUser>("/me"), apiRequest<AccountDashboard>("/me/dashboard"), apiRequest<NotificationPreferences>("/me/notification-preferences")])
      .then(([profile, totals, saved]) => { setUser(profile); updateSessionUser(profile); setDashboard(totals); setPreferences(saved); })
      .catch(showError(setMessage));
  }, []);

  useEffect(() => {
    if (tab !== "tickets") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    let failures = 0;
    setEvents(null);
    const load = async () => {
      if (!active || loading) return;
      loading = true;
      try {
        const result = await apiRequest<GuestEventList>(`/me/events?status=${eventStatus}&page=${eventPage}&limit=10&locale=${locale}`);
        if (active) { setEvents(result); failures = 0; }
      } catch (reason) { if (active) { setMessage(errorMessage(reason)); failures = Math.min(3, failures + 1); } }
      finally { loading = false; if (active) timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); }, 30_000 * (failures + 1)); }
    };
    void load();
    const visible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void load(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [tab, eventStatus, eventPage, locale]);

  useEffect(() => {
    if (tab !== "payments") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    let failures = 0;
    setOrders(null);
    const load = async () => {
      if (!active || loading) return;
      loading = true;
      try {
        const result = await apiRequest<AccountOrderList>(`/me/orders?page=${orderPage}&limit=10`);
        if (active) { setOrders(result); failures = 0; }
      } catch (reason) { if (active) { setMessage(errorMessage(reason)); failures = Math.min(3, failures + 1); } }
      finally { loading = false; if (active) timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); }, 30_000 * (failures + 1)); }
    };
    void load();
    const visible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void load(); } };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [tab, orderPage]);

  useEffect(() => { setPhone(user?.phone ?? ""); setEmail(user?.email ?? ""); setDefaultCity(user?.defaultCity ?? ""); }, [user]);

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const profile = await apiRequest<AuthUser>("/me", { method: "PATCH", body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null, defaultCity: defaultCity.trim() || null }) });
      setUser(profile); updateSessionUser(profile); setMessage(copy.saved);
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function savePreference(key: keyof NotificationPreferences, value: boolean): Promise<void> {
    if (!preferences) return;
    const previous = preferences; setPreferences({ ...preferences, [key]: value }); setMessage(null);
    try { setPreferences(await apiRequest<NotificationPreferences>("/me/notification-preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) })); }
    catch (error) { setPreferences(previous); setMessage(errorMessage(error)); }
  }

  async function becomeOrganizer(): Promise<void> {
    setBusy(true); setMessage(null);
    try { const profile = await apiRequest<AuthUser>("/me/become-organizer", { method: "POST" }); setUser(profile); updateSessionUser(profile); setMessage(copy.organizerEnabled); }
    catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function linkTelegram(): Promise<void> {
    setBusy(true); setMessage(null);
    try { const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", { method: "POST" }); window.location.assign(link.deepLinkUrl); }
    catch (error) { setMessage(errorMessage(error)); setBusy(false); }
  }

  const organizer = user?.role === "organizer" || user?.role === "admin";

  return <section>
    {organizer ? <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#26123f] px-5 py-4 text-white"><p className="font-semibold">{copy.organizerBanner}</p><Link className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#5b21b6]" href={localeUrl("/organizer/events", locale)}>{copy.openOrganizer}</Link></div> : null}
    <div className="rounded-3xl border border-[#e2ddea] bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {user?.photoUrl ? <img alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-[#f0eaff]" src={user.photoUrl} /> : <div aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#ede5ff] text-3xl font-bold text-[#5b21b6]">{user?.name?.slice(0, 1).toUpperCase() || "T"}</div>}
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-extrabold sm:text-3xl">{user?.name || copy.user}</h1><span className="rounded-full bg-[#f0eaff] px-3 py-1 text-xs font-bold text-[#5b21b6]">{user ? copy.roles[user.role] : "…"}</span></div><p className="mt-1 text-sm text-[#665d70]">{user?.telegramId ? `Telegram ID: ${user.telegramId}` : copy.telegramUnlinked}</p><p className="mt-1 text-sm text-[#665d70]">{user?.email || copy.emailMissing} · {user?.phone || copy.phoneMissing}</p></div>
        </div>
        <button className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-semibold" onClick={() => setTab("profile")} type="button">{copy.editProfile}</button>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2"><SummaryCard icon="ticket" label={copy.activeTickets} value={dashboard?.activeAdmissions ?? "…"} /><SummaryCard icon="attended" label={copy.attendedEvents} value={dashboard?.attendedEvents ?? "…"} /></div>
    </div>
    <div className="mt-6 overflow-x-auto border-b border-[#ded8e7]" role="tablist" aria-label={copy.sections}><div className="flex min-w-max gap-1">{TABS.map((item) => <button aria-selected={tab === item} className={`border-b-2 px-4 py-4 text-sm font-bold transition ${tab === item ? "border-[#6425bd] text-[#6425bd]" : "border-transparent text-[#665d70] hover:text-[#26123f]"}`} key={item} onClick={() => setTab(item)} role="tab" type="button">{copy.tabs[item]}</button>)}</div></div>
    {message ? <p aria-live="polite" className="mt-5 rounded-xl bg-[#f2edff] px-4 py-3 text-sm text-[#3b176f]">{message}</p> : null}
    <div className="mt-6" role="tabpanel">
      {tab === "tickets" ? <TicketsPanel events={events} page={eventPage} status={eventStatus} onPage={setEventPage} onStatus={(value) => { setEventStatus(value); setEventPage(1); }} /> : null}
      {tab === "profile" ? <><ProfilePanel busy={busy} city={defaultCity} email={email} phone={phone} organizer={organizer} onBecome={() => void becomeOrganizer()} onCity={setDefaultCity} onEmail={setEmail} onPhone={setPhone} onSave={saveProfile} /><LoginMethodsPanel onUpdated={refreshUser} /></> : null}
      {tab === "notifications" ? <NotificationsPanel linked={Boolean(user?.telegramChatId)} preferences={preferences} busy={busy} onLink={() => { if (user?.telegramId) void linkTelegram(); else setTab("profile"); }} onChange={(key, value) => void savePreference(key, value)} /> : null}
      {tab === "payments" ? <PaymentsPanel orders={orders} page={orderPage} onPage={setOrderPage} /> : null}
    </div>
  </section>;
}

function SummaryCard({ icon, label, value }: { icon: "ticket" | "attended"; label: string; value: number | string }) { return <div className="flex items-center gap-4 rounded-2xl bg-[#f7f4fb] p-5"><span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#6425bd]"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon === "ticket" ? <><path d="M4 5h16a1 1 0 0 1 1 1v3c-1.7 0-3 1.3-3 3s1.3 3 3 3v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3c1.7 0 3-1.3 3-3s-1.3-3-3-3V6a1 1 0 0 1 1-1Z" /><path d="M13 5v2m0 4v2m0 4v2" /></> : <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 9h18m-13 6 2.5 2.5L16 12" /></>}</svg></span><div><p className="text-2xl font-extrabold">{value}</p><p className="text-sm text-[#665d70]">{label}</p></div></div>; }

function TicketsPanel({ events, page, status, onPage, onStatus }: { events: GuestEventList | null; page: number; status: "upcoming" | "past"; onPage: (page: number) => void; onStatus: (status: "upcoming" | "past") => void }) { const copy = ACCOUNT_COPY[useLocale()]; return <div><div className="flex gap-2"><Pill active={status === "upcoming"} onClick={() => onStatus("upcoming")}>{copy.upcoming}</Pill><Pill active={status === "past"} onClick={() => onStatus("past")}>{copy.past}</Pill></div>{!events ? <Loading /> : events.items.length ? <div className="mt-5 grid gap-4">{events.items.map((event) => <GuestEventCard event={event} key={event.id} />)}</div> : <Empty text={status === "upcoming" ? copy.noUpcoming : copy.noPast} />}{events && events.total > events.limit ? <Pager page={page} hasNext={events.hasNext} onPage={onPage} /> : null}</div>; }

function ProfilePanel({ busy, city, email, phone, organizer, onBecome, onCity, onEmail, onPhone, onSave }: { busy: boolean; city: string; email: string; phone: string; organizer: boolean; onBecome: () => void; onCity: (value: string) => void; onEmail: (value: string) => void; onPhone: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) { const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; return <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><form className="rounded-2xl border border-[#ded8e7] bg-white p-6" onSubmit={onSave}><h2 className="text-xl font-bold">{copy.personalData}</h2><p className="mt-2 text-sm text-[#665d70]">{copy.contactsHint}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label={copy.contactPhone} value={phone} onChange={onPhone} /><Field label={copy.contactEmail} type="email" value={email} onChange={onEmail} /><Field label={copy.defaultCity} value={city} onChange={onCity} /></div><button className="mt-6 rounded-xl bg-[#5b21b6] px-5 py-3 font-bold text-white disabled:opacity-50" disabled={busy} type="submit">{copy.saveChanges}</button></form><aside className="rounded-2xl bg-[#26123f] p-6 text-white"><h2 className="text-xl font-bold">{copy.roleTitle}</h2><p className="mt-3 text-sm text-white/75">{copy.roleHint}</p>{organizer ? <Link className="mt-6 inline-block rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6]" href={localeUrl("/organizer/events", locale)}>{copy.organizerCabinet}</Link> : <button className="mt-6 rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6] disabled:opacity-60" disabled={busy} onClick={onBecome} type="button">{copy.becomeOrganizer}</button>}</aside></div>; }


function PaymentsPanel({ orders, page, onPage }: { orders: AccountOrderList | null; page: number; onPage: (page: number) => void }) { const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; if (!orders) return <Loading />; if (!orders.items.length) return <Empty text={copy.paymentsEmpty} />; return <div className="rounded-2xl border border-[#ded8e7] bg-white"><div className="border-b border-[#ece7f1] p-6"><h2 className="text-xl font-bold">{copy.paymentsTitle}</h2><p className="mt-1 text-sm text-[#665d70]">{copy.onlyAccount}</p></div><div className="divide-y divide-[#ece7f1]">{orders.items.map((order) => <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center" key={order.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{order.eventTitle}</p><span className="rounded-full bg-[#f1edf5] px-2.5 py-1 text-xs font-bold">{paymentStatus(order.status, locale)}</span></div><p className="mt-1 text-sm text-[#665d70]">{order.itemSummary} · {new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(new Date(order.createdAt))}</p><p className="mt-2 text-xs text-[#80758d]">{copy.receiptUnavailable}</p>{order.eventId && ["paid", "refunded", "cancelled"].includes(order.status) ? <Link className="mt-2 inline-block text-sm font-semibold text-[#5b21b6]" href={localeUrl(`/my-events/events/${order.eventId}/orders/${order.id}/chat`, locale)}>{copy.writeOrganizer}</Link> : null}</div><p className="text-lg font-extrabold">{formatMoney(order.amount, order.currency, locale)}</p></div>)}</div>{orders.total > orders.limit ? <div className="p-5"><Pager page={page} hasNext={orders.hasNext} onPage={onPage} /></div> : null}</div>; }

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-bold">{label}<input className="rounded-xl border border-[#d2cadc] bg-white px-4 py-3 font-normal outline-none focus:border-[#713dcc] focus:ring-2 focus:ring-[#e4d7fa]" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function Pill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) { return <button className={`rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-[#5b21b6] text-white" : "border border-[#d2cadc] bg-white text-[#51485c]"}`} onClick={onClick} type="button">{children}</button>; }
function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) { const copy = ACCOUNT_COPY[useLocale()]; return <nav className="mt-5 flex items-center justify-between" aria-label={copy.pages}><button className="rounded-lg border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))} type="button">{copy.back}</button><span className="text-sm text-[#665d70]">{copy.page} {page}</span><button className="rounded-lg border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={!hasNext} onClick={() => onPage(page + 1)} type="button">{copy.next}</button></nav>; }
function Loading() { const copy = ACCOUNT_COPY[useLocale()]; return <p className="mt-6 text-sm text-[#665d70]">{copy.loading}</p>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-2xl border border-dashed border-[#d2cadc] bg-white p-10 text-center text-[#665d70]">{text}</div>; }
function paymentStatus(status: string, locale: EventLocale): string { return ACCOUNT_COPY[locale].paymentStatuses[status] ?? status; }
function formatMoney(value: number, currency: string, locale: EventLocale): string { return new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency }).format(value / 100); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : ACCOUNT_COPY[localeFromBrowser()].failed; }
function showError(setter: (message: string) => void): (error: unknown) => void { return (error) => setter(errorMessage(error)); }
