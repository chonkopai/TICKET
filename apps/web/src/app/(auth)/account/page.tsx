"use client";

import { catalogCityOptions, type AccountDashboard, type AccountOrderList, type AuthUser, type GuestEventList, type LinkedMethodsResponse, type NotificationPreferences, type TelegramLinkTokenResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { AccountIcon } from "../../../components/account-icon";
import { FavoritesContent } from "../../../components/favorites-content";
import { GuestEventCard } from "../../../components/guest-event-card";
import { useLocale } from "../../../components/locale-provider";
import { ACCOUNT_COPY } from "../../../lib/account-copy";
import { ACCOUNT_REDESIGN_COPY } from "../../../lib/account-redesign-copy";
import { INTL_LOCALES, localeUrl } from "../../../lib/locale";
import { ProtectedRoute } from "../_components/protected-route";
import { apiRequest, logoutSession } from "../_lib/api";
import { getSession, updateSessionUser } from "../_lib/session";
import { LoginMethodsPanel } from "./login-methods-panel";
import { NotificationsPanel } from "./notifications-panel";
import { useAccountResource } from "./use-account-resource";

type AccountTab = "tickets" | "favorites" | "profile" | "notifications" | "payments";
const TABS: AccountTab[] = ["tickets", "favorites", "profile", "notifications", "payments"];
const NAV_ICONS: Record<AccountTab, string> = { tickets: "ticket", favorites: "heart", profile: "user-round", notifications: "bell", payments: "receipt-text" };

export default function AccountPage() {
  return <main className="account-workspace"><ProtectedRoute><Suspense fallback={<Loading />}><Account /></Suspense></ProtectedRoute></main>;
}

function Account() {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale];
  const params = useSearchParams(); const requested = params.get("tab");
  const tab: AccountTab = TABS.includes(requested as AccountTab) ? requested as AccountTab : "tickets";
  const [user, setUser] = useState<AuthUser | null>(() => getSession()?.user ?? null);
  const profile = useAccountResource<AuthUser>("/me", false);
  const dashboard = useAccountResource<AccountDashboard>(tab === "tickets" ? "/me/dashboard" : null);
  const preferenceResource = useAccountResource<NotificationPreferences>("/me/notification-preferences", false);
  const identities = useAccountResource<LinkedMethodsResponse>(tab === "profile" ? "/me/identities" : null, false);
  const [eventStatus, setEventStatus] = useState<"upcoming" | "past">("upcoming");
  const [eventPage, setEventPage] = useState(1); const [orderPage, setOrderPage] = useState(1);
  const events = useAccountResource<GuestEventList>(tab === "tickets" ? `/me/events?status=${eventStatus}&page=${eventPage}&limit=10&locale=${locale}` : null);
  const otherEvents = useAccountResource<GuestEventList>(tab === "tickets" ? `/me/events?status=${eventStatus === "upcoming" ? "past" : "upcoming"}&page=1&limit=1&locale=${locale}` : null);
  const orders = useAccountResource<AccountOrderList>(tab === "tickets" ? "/me/orders?page=1&limit=3" : tab === "payments" ? `/me/orders?page=${orderPage}&limit=10` : null);
  const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [defaultCity, setDefaultCity] = useState("");
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false); const preferenceLock = useRef(false);
  const support = useRef<HTMLDialogElement>(null); const organizer = user?.role === "organizer" || user?.role === "admin";

  useEffect(() => { if (profile.data) { setUser(profile.data); updateSessionUser(profile.data); } }, [profile.data]);
  useEffect(() => { setPhone(user?.phone ?? ""); setEmail(user?.email ?? ""); setDefaultCity(user?.defaultCity ?? ""); }, [user]);
  useEffect(() => { setMessage(null); }, [tab]);
  function selectTab(next: AccountTab) {
    const url = new URL(window.location.href); url.searchParams.set("tab", next); url.searchParams.set("lang", locale);
    if (url.search !== window.location.search) window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function followTab(event: MouseEvent<HTMLAnchorElement>, next: AccountTab) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); selectTab(next);
  }
  const refreshUser = useCallback(() => {
    void apiRequest<AuthUser>("/me").then(value => { setUser(value); updateSessionUser(value); }).catch(reason => setMessage(errorMessage(reason)));
  }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const value = await apiRequest<AuthUser>("/me", { method: "PATCH", body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null, defaultCity: defaultCity.trim() || null }) }); setUser(value); updateSessionUser(value); setMessage(copy.saved); }
    catch (reason) { setMessage(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function savePreference(key: keyof NotificationPreferences, value: boolean) {
    const previous = preferenceResource.data; if (!previous || preferenceLock.current) return;
    preferenceLock.current = true; setSavingPreference(true); setMessage(null); preferenceResource.setData({ ...previous, [key]: value });
    try { preferenceResource.setData(await apiRequest<NotificationPreferences>("/me/notification-preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) })); }
    catch (reason) { preferenceResource.setData(previous); setMessage(`${design.saveFailed} ${errorMessage(reason)}`); }
    finally { preferenceLock.current = false; setSavingPreference(false); }
  }
  async function becomeOrganizer() {
    setBusy(true); setMessage(null);
    try { const value = await apiRequest<AuthUser>("/me/become-organizer", { method: "POST" }); setUser(value); updateSessionUser(value); setMessage(copy.organizerEnabled); }
    catch (reason) { setMessage(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function linkTelegram() {
    if (!user?.telegramId) { selectTab("profile"); return; }
    setBusy(true); setMessage(null);
    try { const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", { method: "POST" }); window.location.assign(link.deepLinkUrl); }
    catch (reason) { setMessage(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setMessage(null);
    try { await logoutSession(); window.location.assign(localeUrl("/", locale)); }
    catch (reason) { setMessage(errorMessage(reason)); setBusy(false); }
  }
  const title = tab === "tickets" ? design.tickets : tab === "profile" ? design.profile : tab === "notifications" ? design.notifications : copy.tabs[tab];
  const description = tab === "tickets" ? design.ticketsHint : tab === "profile" ? design.profileHint : tab === "notifications" ? design.notificationsHint : undefined;
  const navLabel = (item: AccountTab) => item === "tickets" ? design.tickets : item === "profile" ? design.profileNav : item === "notifications" ? design.notificationsNav : copy.tabs[item];

  return <div className="account-layout">
    <aside className="account-sidebar">
      <div className="account-identity"><div className="account-avatar">{user?.photoUrl ? <img alt="" src={new URL(user.photoUrl, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString()} /> : user?.name?.slice(0, 1).toUpperCase() || "T"}</div><div className="account-identity-details"><p className="account-name">{user?.name || copy.user}</p><p className="account-role">{user ? copy.roles[user.role] : "…"}</p><p>{user?.telegramId ? design.telegramLinked : copy.telegramUnlinked}</p><p>{!user?.email && !user?.phone ? design.noContacts : [user?.email || copy.emailMissing, user?.phone || copy.phoneMissing].join(" · ")}</p></div></div>
      <div className="account-organizer"><h2>{design.organizer}</h2><p>{design.organizerHint}</p>{organizer ? <Link className="account-text-link" href={localeUrl("/organizer/events", locale)}>{copy.organizerCabinet}<AccountIcon name="arrow-up-right" /></Link> : <button className="account-text-link" disabled={busy} type="button" onClick={() => void becomeOrganizer()}>{copy.becomeOrganizer}<AccountIcon name="arrow-up-right" /></button>}</div>
      <nav className="account-navigation" aria-label={copy.sections}>{TABS.map(item => <Link aria-current={tab === item ? "page" : undefined} className={tab === item ? "is-active" : ""} key={item} href={localeUrl(`/account?tab=${item}`, locale)} onClick={event => followTab(event, item)}><AccountIcon name={NAV_ICONS[item]} />{navLabel(item)}</Link>)}</nav>
      <div className="account-utilities"><button type="button" onClick={() => support.current?.showModal()}><AccountIcon name="circle-help" />{design.help}</button><button disabled={busy} type="button" onClick={() => void logout()}><AccountIcon name="log-out" />{design.logout}</button><p>© {new Date().getFullYear()} TICKET</p></div>
    </aside>
    <div className="account-content"><header className="account-heading"><p>{design.account}</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</header>
      {message ? <p className="account-message" role="status">{message}</p> : null}{profile.error ? <ResourceError message={profile.error} onRetry={profile.retry} /> : null}
      {tab === "tickets" ? <><div className="account-summary"><SummaryCard icon="ticket" label={copy.activeTickets} value={dashboard.data?.activeAdmissions ?? "…"} /><SummaryCard icon="calendar-check" label={copy.attendedEvents} value={dashboard.data?.attendedEvents ?? "…"} /></div>{dashboard.error ? <ResourceError message={dashboard.error} onRetry={dashboard.retry} /> : null}
        <TicketsPanel events={events.data} error={events.error} onRetry={events.retry} page={eventPage} status={eventStatus} upcoming={eventStatus === "upcoming" ? events.data?.total : otherEvents.data?.total} past={eventStatus === "past" ? events.data?.total : otherEvents.data?.total} onPage={setEventPage} onStatus={value => { setEventStatus(value); setEventPage(1); }} />
        <section className="account-card account-orders"><div className="account-card-toolbar"><h2>{design.myOrders}</h2><Link className="account-text-link" href={localeUrl("/account?tab=payments", locale)} onClick={event => followTab(event, "payments")}>{copy.tabs.payments}<AccountIcon name="arrow-right" /></Link></div>{orders.error ? <ResourceError message={orders.error} onRetry={orders.retry} /> : !orders.data ? <Loading /> : orders.data.items.length ? <OrderRows orders={orders.data} /> : <div className="account-no-orders"><span className="account-symbol"><AccountIcon name="shopping-bag" /></span><div><p>{design.noOrders}</p><p>{design.ordersHint}</p></div></div>}</section>
        <div className="account-ticket-help"><AccountIcon name="circle-help" /><span>{design.ticketHelp}</span><button type="button" className="account-text-link" onClick={() => support.current?.showModal()}>{design.contactSupport}</button></div></> : null}
      {tab === "favorites" ? <FavoritesContent embedded /> : null}
      {tab === "profile" ? <><ProfilePanel busy={busy} city={defaultCity} email={email} phone={phone} loginEmail={identities.data?.email.address ?? null} onCity={setDefaultCity} onEmail={setEmail} onPhone={setPhone} onSave={saveProfile} />{identities.error ? <ResourceError message={identities.error} onRetry={identities.retry} /> : null}<LoginMethodsPanel methods={identities.data} onMethodsChange={identities.setData} onUpdated={refreshUser} /></> : null}
      {tab === "notifications" ? <NotificationsPanel linked={Boolean(user?.telegramChatId)} preferences={preferenceResource.data} preferencesError={preferenceResource.error} onRetryPreferences={preferenceResource.retry} busy={busy} savingPreference={savingPreference} onLink={() => void linkTelegram()} onChange={(key, value) => void savePreference(key, value)} /> : null}
      {tab === "payments" ? orders.error ? <ResourceError message={orders.error} onRetry={orders.retry} /> : <PaymentsPanel orders={orders.data} page={orderPage} onPage={setOrderPage} /> : null}
    </div>
    <dialog className="account-support account-card" aria-labelledby="account-support-title" ref={support}><div className="account-card-toolbar"><h2 id="account-support-title">{design.help}</h2><button type="button" className="account-button" onClick={() => support.current?.close()}>{design.close}</button></div><p>{design.supportHint}</p><div className="account-support-actions"><button type="button" className="account-button account-button-primary" onClick={() => { support.current?.close(); selectTab("payments"); }}>{design.openPayments}</button><button type="button" className="account-text-link" onClick={() => { support.current?.close(); selectTab("profile"); }}>{design.openSettings}</button></div></dialog>
  </div>;
}

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: number | string }) { return <div className="account-card account-metric"><span className="account-symbol"><AccountIcon name={icon} /></span><div><p>{value}</p><p>{label}</p></div></div>; }

function TicketsPanel({ events, error, onRetry, page, status, upcoming, past, onPage, onStatus }: { events: GuestEventList | null; error: string | null; onRetry: () => void; page: number; status: "upcoming" | "past"; upcoming: number | undefined; past: number | undefined; onPage: (page: number) => void; onStatus: (status: "upcoming" | "past") => void }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale];
  return <section className="account-card account-tickets"><div className="account-ticket-tabs" role="group" aria-label={copy.sections}>{(["upcoming", "past"] as const).map(item => <button key={item} type="button" aria-pressed={status === item} className={status === item ? "is-active" : ""} onClick={() => onStatus(item)}>{copy[item]}<span>{(item === "upcoming" ? upcoming : past) ?? "…"}</span></button>)}</div>{error ? <ResourceError message={error} onRetry={onRetry} /> : null}{!events ? error ? null : <Loading /> : events.items.length ? <div className="account-event-list">{events.items.map(event => <GuestEventCard event={event} key={event.id} />)}</div> : <div className="account-ticket-empty"><span className="account-empty-symbol"><AccountIcon name="ticket" /></span><div><h2>{status === "upcoming" ? design.noUpcoming : copy.noPast}</h2><p>{design.emptyTicketsHint}</p></div><Link className="account-button account-button-primary" href={localeUrl("/", locale)}><AccountIcon name="arrow-right" />{design.findEvent}</Link></div>}{events && events.total > events.limit ? <Pager page={page} hasNext={events.hasNext} onPage={onPage} /> : null}</section>;
}

function ProfilePanel({ busy, city, email, phone, loginEmail, onCity, onEmail, onPhone, onSave }: { busy: boolean; city: string; email: string; phone: string; loginEmail: string | null; onCity: (value: string) => void; onEmail: (value: string) => void; onPhone: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale]; const cities = catalogCityOptions("KZ", locale, city ? [city] : []);
  return <div className="account-profile-row"><form className="account-card account-profile-form" onSubmit={onSave}><div><h2>{copy.personalData}</h2><p className="account-subtitle">{design.contactsHint}</p></div><div className="account-fields"><Field label={copy.contactPhone} type="tel" value={phone} onChange={onPhone} /><Field label={copy.contactEmail} type="email" value={email} onChange={onEmail} /><label className="account-field">{copy.defaultCity}<span className="account-city"><input list="account-cities" value={city} placeholder={design.chooseCity} onChange={event => onCity(event.target.value)} /><AccountIcon name="chevron-down" /></span><datalist id="account-cities">{cities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist></label><p className="account-city-hint">{design.cityHint}</p></div><div className="account-form-actions"><button className="account-button account-button-primary" disabled={busy} type="submit">{copy.saveChanges}</button><span>{design.optional}</span></div></form><aside className="account-card account-contact-guidance"><span className="account-symbol"><AccountIcon name="contact-round" /></span><h2>{design.contactsTitle}</h2><p>{loginEmail ? email ? design.contactsPresent : design.contactsMissing : design.noLoginEmail}</p>{loginEmail ? <p className="account-login-email">{loginEmail}</p> : null}<p>{design.separateVerification}</p></aside></div>;
}

function PaymentsPanel({ orders, page, onPage }: { orders: AccountOrderList | null; page: number; onPage: (page: number) => void }) {
  const copy = ACCOUNT_COPY[useLocale()]; if (!orders) return <Loading />;
  return <section className="account-card account-orders"><div><h2>{copy.paymentsTitle}</h2><p className="account-subtitle">{copy.onlyAccount}</p></div>{orders.items.length ? <OrderRows orders={orders} /> : <p className="account-muted">{copy.paymentsEmpty}</p>}{orders.total > orders.limit ? <Pager page={page} hasNext={orders.hasNext} onPage={onPage} /> : null}</section>;
}
function OrderRows({ orders }: { orders: AccountOrderList }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale];
  return <div className="account-order-list">{orders.items.map(order => <article className="account-order" key={order.id}><div><div className="account-order-title"><h3>{order.eventTitle}</h3><span>{copy.paymentStatuses[order.status] ?? order.status}</span></div><p>{order.itemSummary} · {new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(new Date(order.createdAt))}</p><p className="account-receipt">{copy.receiptUnavailable}</p>{order.eventId && ["paid", "refunded", "cancelled"].includes(order.status) ? <Link className="account-text-link" href={localeUrl(`/account/events/${order.eventId}/orders/${order.id}/chat`, locale)}>{copy.writeOrganizer}</Link> : null}</div><strong>{new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency: order.currency }).format(order.amount / 100)}</strong></article>)}</div>;
}
function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) { return <label className="account-field">{label}<input type={type} value={value} placeholder={ACCOUNT_REDESIGN_COPY[useLocale()].notProvided} onChange={event => onChange(event.target.value)} /></label>; }
function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) { const copy = ACCOUNT_COPY[useLocale()]; return <nav className="account-pager" aria-label={copy.pages}><button className="account-button" disabled={page === 1} type="button" onClick={() => onPage(Math.max(1, page - 1))}>{copy.back}</button><span>{copy.page} {page}</span><button className="account-button" disabled={!hasNext} type="button" onClick={() => onPage(page + 1)}>{copy.next}</button></nav>; }
function ResourceError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="account-resource-error" role="alert"><p>{message}</p><button type="button" className="account-text-link" onClick={onRetry}>{ACCOUNT_REDESIGN_COPY[useLocale()].retry}</button></div>; }
function Loading() { return <p className="account-loading" role="status">{ACCOUNT_COPY[useLocale()].loading}</p>; }
function errorMessage(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }
