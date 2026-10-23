"use client";
import { OrderChatButton } from "../../../components/floating-order-chat";

import { catalogCityOptions, eventExpiryTime, type AccountDashboard, type AccountOrderList, type AuthUser, type GuestEventList, type LinkedMethodsResponse, type NotificationPreferences, type TelegramLinkTokenResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { AccountIcon } from "../../../components/account-icon";
import { useDisplayCurrency } from "../../../components/currency-provider";
import { FavoritesContent } from "../../../components/favorites-content";
import { GuestEventCard } from "../../../components/guest-event-card";
import { useLocale } from "../../../components/locale-provider";
import { OptionPicker } from "../../../components/option-picker";
import { COUNTRY_CODES, countryName } from "../../../lib/countries";
import type { DisplayCurrency } from "../../../lib/display-currency";
import { ACCOUNT_EXPERIENCE_COPY } from "../../../lib/account-experience-copy";
import { SupportPanel } from "./support-panel";
import { rememberCatalogLocation, clearCatalogLocation, countryForCity } from "../../../lib/catalog-location";
import { CATALOG_CITY_SELECTED } from "../../../lib/catalog-query-events";
import { ACCOUNT_COPY } from "../../../lib/account-copy";
import { ACCOUNT_REDESIGN_COPY } from "../../../lib/account-redesign-copy";
import { INTL_LOCALES, localeUrl } from "../../../lib/locale";
import { ProtectedRoute } from "../_components/protected-route";
import { apiRequest, logoutSession } from "../_lib/api";
import { getSession, updateSessionUser } from "../_lib/session";
import { LoginMethodsPanel } from "./login-methods-panel";
import { NotificationsPanel } from "./notifications-panel";
import { useAccountResource } from "./use-account-resource";

type AccountTab = "tickets" | "favorites" | "profile" | "notifications" | "payments" | "support";
const TABS: Exclude<AccountTab, "support">[] = ["tickets", "favorites", "profile", "notifications", "payments"];
const NAV_ICONS: Record<Exclude<AccountTab, "support">, string> = { tickets: "ticket", favorites: "heart", profile: "user-round", notifications: "bell", payments: "receipt-text" };

export default function AccountPage() {
  return <main className="account-workspace"><ProtectedRoute><Suspense fallback={<Loading />}><Account /></Suspense></ProtectedRoute></main>;
}

function Account() {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale]; const experience = ACCOUNT_EXPERIENCE_COPY[locale];
  const params = useSearchParams(); const requested = params.get("tab");
  const tab: AccountTab = (requested === "support" || TABS.includes(requested as Exclude<AccountTab, "support">)) ? requested as AccountTab : "tickets";
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
  const { setCurrency } = useDisplayCurrency();
  const [defaultCountry, setDefaultCountry] = useState("");
  const [preferredCurrency, setPreferredCurrency] = useState<DisplayCurrency>("KZT");
  const [defaultCity, setDefaultCity] = useState("");
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false); const preferenceLock = useRef(false);
  const organizer = user?.role === "organizer" || user?.role === "admin";

  useEffect(() => {
    if (tab !== "tickets") return;
    const now = Date.now();
    const cutoffs = [...(events.data?.items ?? []), ...(otherEvents.data?.items ?? [])].map(eventExpiryTime).filter(time => time > now);
    if (!cutoffs.length) return;
    const timer = setTimeout(() => { events.retry(); otherEvents.retry(); dashboard.retry(); }, Math.min(Math.min(...cutoffs) - now + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [tab, events.data, otherEvents.data, events.retry, otherEvents.retry, dashboard.retry]);

  useEffect(() => { if (profile.data) { setUser(profile.data); updateSessionUser(profile.data); } }, [profile.data]);
  useEffect(() => { setDefaultCity(user?.defaultCity ?? ""); setDefaultCountry(user?.defaultCountry ?? (user?.defaultCity ? countryForCity(user.defaultCity) ?? "" : "")); setPreferredCurrency(user?.preferredCurrency ?? "KZT"); }, [user]);
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
    try { const value = await apiRequest<AuthUser>("/me", { method: "PATCH", body: JSON.stringify({ defaultCity: defaultCity.trim() || null, defaultCountry: defaultCountry || null, preferredCurrency }) }); setUser(value); updateSessionUser(value); if (value.defaultCountry) rememberCatalogLocation({ countryCode: value.defaultCountry, city: value.defaultCity ?? "" }); else clearCatalogLocation(); setCurrency(preferredCurrency); window.dispatchEvent(new Event(CATALOG_CITY_SELECTED)); setMessage(experience.saved); }
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
    try { const value = await apiRequest<AuthUser>("/me/become-organizer", { method: "POST" }); setUser(value); updateSessionUser(value); window.location.assign(localeUrl("/organizer/events", locale)); }
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
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") refreshUser(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [refreshUser]);
  const title = tab === "support" ? design.help : tab === "tickets" ? design.tickets : tab === "profile" ? design.profile : tab === "notifications" ? design.notifications : copy.tabs[tab];
  const description = tab === "support" ? experience.supportHint : tab === "tickets" ? design.ticketsHint : tab === "profile" ? experience.profileHint : tab === "notifications" ? design.notificationsHint : undefined;
  const navLabel = (item: Exclude<AccountTab, "support">) => item === "tickets" ? design.tickets : item === "profile" ? design.profileNav : item === "notifications" ? design.notificationsNav : copy.tabs[item];

  return <div className="account-layout">
    <aside className="account-sidebar">
      <div className="account-identity"><div className="account-avatar">{user?.photoUrl ? <img alt="" src={new URL(user.photoUrl, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString()} /> : user?.name?.slice(0, 1).toUpperCase() || "T"}</div><div className="account-identity-details"><p className="account-name">{user?.name || copy.user}</p><p className="account-role">{user ? copy.roles[user.role] : "…"}</p><p>{user?.telegramId ? design.telegramLinked : copy.telegramUnlinked}</p></div></div>
      <div className="account-organizer"><h2>{design.organizer}</h2><p>{design.organizerHint}</p>{organizer ? <Link className="account-text-link" href={localeUrl("/organizer/events", locale)}>{copy.organizerCabinet}<AccountIcon name="arrow-up-right" /></Link> : <button className="account-text-link" disabled={busy} type="button" onClick={() => void becomeOrganizer()}>{copy.becomeOrganizer}<AccountIcon name="arrow-up-right" /></button>}</div>
      <nav className="account-navigation" aria-label={copy.sections}><Link href={localeUrl("/", locale)}><AccountIcon name="arrow-left" />{experience.backToAfisha}</Link>{TABS.map(item => <Link aria-current={tab === item ? "page" : undefined} className={tab === item ? "is-active" : ""} key={item} href={localeUrl(`/account?tab=${item}`, locale)} onClick={event => followTab(event, item)}><AccountIcon name={NAV_ICONS[item]} />{navLabel(item)}</Link>)}</nav>
      <div className="account-utilities"><Link className={tab === "support" ? "is-active" : ""} aria-current={tab === "support" ? "page" : undefined} href={localeUrl("/account?tab=support", locale)} onClick={event => followTab(event, "support")}><AccountIcon name="circle-help" />{design.help}</Link><button disabled={busy} type="button" onClick={() => void logout()}><AccountIcon name="log-out" />{design.logout}</button><p>© {new Date().getFullYear()} TICKET</p></div>
    </aside>
    <div className="account-content"><header className="account-heading"><div className="account-heading-copy"><p>{design.account}</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div></header>
      {message ? <p className="account-message" role="status">{message}</p> : null}{profile.error ? <ResourceError message={profile.error} onRetry={profile.retry} /> : null}
      {tab === "tickets" ? <><div className="account-summary"><SummaryCard icon="ticket" label={copy.activeTickets} value={dashboard.data?.activeAdmissions ?? "…"} /><SummaryCard icon="calendar-check" label={copy.attendedEvents} value={dashboard.data?.attendedEvents ?? "…"} /></div>{dashboard.error ? <ResourceError message={dashboard.error} onRetry={dashboard.retry} /> : null}
        <TicketsPanel events={events.data} error={events.error} onRetry={events.retry} onReturned={() => { events.retry(); otherEvents.retry(); dashboard.retry(); orders.retry(); }} page={eventPage} status={eventStatus} upcoming={eventStatus === "upcoming" ? events.data?.total : otherEvents.data?.total} past={eventStatus === "past" ? events.data?.total : otherEvents.data?.total} onPage={setEventPage} onStatus={value => { setEventStatus(value); setEventPage(1); }} />
        <section className="account-card account-orders"><div className="account-card-toolbar"><h2>{design.myOrders}</h2><Link className="account-text-link" href={localeUrl("/account?tab=payments", locale)} onClick={event => followTab(event, "payments")}>{copy.tabs.payments}<AccountIcon name="arrow-right" /></Link></div>{orders.error ? <ResourceError message={orders.error} onRetry={orders.retry} /> : !orders.data ? <Loading /> : orders.data.items.length ? <OrderRows orders={orders.data} /> : <div className="account-no-orders"><span className="account-symbol"><AccountIcon name="shopping-bag" /></span><div><p>{design.noOrders}</p><p>{design.ordersHint}</p></div></div>}</section>
        <div className="account-ticket-help"><AccountIcon name="circle-help" /><span>{design.ticketHelp}</span><button type="button" className="account-text-link" onClick={() => selectTab("support")}>{design.contactSupport}</button></div></> : null}
      {tab === "favorites" ? <FavoritesContent embedded /> : null}
      {tab === "profile" ? <>{identities.error ? <ResourceError message={identities.error} onRetry={identities.retry} /> : null}<LoginMethodsPanel methods={identities.data} onMethodsChange={identities.setData} onUpdated={refreshUser} /><PreferencesPanel busy={busy} country={defaultCountry} onCountry={value => { setDefaultCountry(value); setDefaultCity(""); }} city={defaultCity} onCity={setDefaultCity} currency={preferredCurrency} onCurrency={setPreferredCurrency} onSave={saveProfile} /></> : null}
      {tab === "notifications" ? <NotificationsPanel linked={Boolean(user?.telegramChatId)} preferences={preferenceResource.data} preferencesError={preferenceResource.error} onRetryPreferences={preferenceResource.retry} busy={busy} savingPreference={savingPreference} onLink={() => void linkTelegram()} onChange={(key, value) => void savePreference(key, value)} /> : null}
      {tab === "support" ? <SupportPanel /> : null}
      {tab === "payments" ? <>{orders.error ? <ResourceError message={orders.error} onRetry={orders.retry} /> : <PaymentsPanel orders={orders.data} page={orderPage} onPage={setOrderPage} />}</> : null}
    </div>

  </div>;
}

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: number | string }) { return <div className="account-card account-metric"><span className="account-symbol"><AccountIcon name={icon} /></span><div><p>{value}</p><p>{label}</p></div></div>; }

function TicketsPanel({ events, error, onRetry, onReturned, page, status, upcoming, past, onPage, onStatus }: { events: GuestEventList | null; error: string | null; onRetry: () => void; onReturned: () => void; page: number; status: "upcoming" | "past"; upcoming: number | undefined; past: number | undefined; onPage: (page: number) => void; onStatus: (status: "upcoming" | "past") => void }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale];
  return <section className="account-card account-tickets"><div className="account-ticket-tabs" role="group" aria-label={copy.sections}>{(["upcoming", "past"] as const).map(item => <button key={item} type="button" aria-pressed={status === item} className={status === item ? "is-active" : ""} onClick={() => onStatus(item)}>{copy[item]}<span>{(item === "upcoming" ? upcoming : past) ?? "…"}</span></button>)}</div>{error ? <ResourceError message={error} onRetry={onRetry} /> : null}{!events ? error ? null : <Loading /> : events.items.length ? <div className="account-event-list">{events.items.map(event => <GuestEventCard event={event} key={event.id} onReturned={onReturned} />)}</div> : <div className="account-ticket-empty"><span className="account-empty-symbol"><AccountIcon name="ticket" /></span><div><h2>{status === "upcoming" ? design.noUpcoming : copy.noPast}</h2><p>{design.emptyTicketsHint}</p></div><Link className="account-button account-button-primary" href={localeUrl("/", locale)}><AccountIcon name="arrow-right" />{design.findEvent}</Link></div>}{events && events.total > events.limit ? <Pager page={page} hasNext={events.hasNext} onPage={onPage} /> : null}</section>;
}

function PreferencesPanel({ busy, country, onCountry, city, onCity, currency, onCurrency, onSave }: { busy: boolean; country: string; onCountry: (value: string) => void; city: string; onCity: (value: string) => void; currency: DisplayCurrency; onCurrency: (value: DisplayCurrency) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale]; const design = ACCOUNT_REDESIGN_COPY[locale]; const experience = ACCOUNT_EXPERIENCE_COPY[locale];
  const labels = { ru: ["Страна", "Все страны", "Выберите страну, город и валюту для поиска событий."], kk: ["Ел", "Барлық елдер", "Іс-шара іздеу үшін елді, қаланы және валютаны таңдаңыз."], en: ["Country", "All countries", "Choose your country, city, and currency for finding events."] }[locale];
  const [locations, setLocations] = useState<{ countryCode: string; cities: string[] }[]>([]);
  useEffect(() => { let active = true; void fetch("/api/events/locations").then(response => response.ok ? response.json() : []).then(value => { if (active && Array.isArray(value)) setLocations(value); }).catch(() => {}); return () => { active = false; }; }, []);
  const cities = catalogCityOptions(country, locale, [...(locations.find(item => item.countryCode === country)?.cities ?? []), ...(city ? [city] : [])]);
  return <form className="account-card account-preferences-form" onSubmit={onSave}><div><h2>{experience.preferences}</h2><p className="account-subtitle">{labels[2]}</p></div><div className="grid gap-4 sm:grid-cols-2">
    <div className="account-city-preference"><label htmlFor="account-country-picker">{labels[0]}</label><OptionPicker id="account-country-picker" label={labels[0]!} value={country} options={[{ value: "", label: labels[1]! }, ...[...COUNTRY_CODES].sort((a,b) => countryName(a,locale).localeCompare(countryName(b,locale),locale)).map(code => ({ value: code, label: countryName(code, locale) }))]} disabled={busy} onChange={onCountry} icon={<AccountIcon name="map-pin" />} /></div>
    <div className="account-city-preference"><label htmlFor="account-city-picker">{copy.defaultCity}</label><OptionPicker id="account-city-picker" label={copy.defaultCity} value={city} options={[{ value: "", label: design.chooseCity }, ...cities]} disabled={busy || !country} onChange={onCity} icon={<AccountIcon name="map-pin" />} /></div>
    <div className="account-city-preference"><label htmlFor="account-currency-picker">{design.defaultCurrency}</label><OptionPicker id="account-currency-picker" label={design.defaultCurrency} value={currency} options={[{ value: "KZT", label: ({ ru: "Казахстанский тенге", kk: "Қазақстан теңгесі", en: "Kazakhstani tenge" })[locale] + " · KZT ₸" }, { value: "RUB", label: ({ ru: "Российский рубль", kk: "Ресей рублі", en: "Russian ruble" })[locale] + " · RUB ₽" }, { value: "USD", label: "US dollar · USD $" }]} disabled={busy} onChange={value => onCurrency(value as DisplayCurrency)} icon={<AccountIcon name="money" />} /></div>
  </div><button className="account-button account-button-primary" disabled={busy} type="submit">{copy.saveChanges}</button></form>;
}

function PaymentsPanel({ orders, page, onPage }: { orders: AccountOrderList | null; page: number; onPage: (page: number) => void }) {
  const copy = ACCOUNT_COPY[useLocale()]; if (!orders) return <Loading />;
  return <section className="account-card account-orders"><div><h2>{copy.paymentsTitle}</h2><p className="account-subtitle">{copy.onlyAccount}</p></div>{orders.items.length ? <OrderRows orders={orders} /> : <p className="account-muted">{copy.paymentsEmpty}</p>}{orders.total > orders.limit ? <Pager page={page} hasNext={orders.hasNext} onPage={onPage} /> : null}</section>;
}
function OrderRows({ orders }: { orders: AccountOrderList }) {
  const locale = useLocale(); const copy = ACCOUNT_COPY[locale];
  return <div className="account-order-list">{orders.items.map(order => <article className="account-order" key={order.id}><div><div className="account-order-title"><h3>{order.eventTitle}</h3><span>{copy.paymentStatuses[order.status] ?? order.status}</span></div><p>{order.itemSummary} · {new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(new Date(order.createdAt))}</p><p className="account-receipt">{copy.receiptUnavailable}</p>{order.eventId ? <OrderChatButton className="account-text-link" eventId={order.eventId!} orderId={order.id} title={order.eventTitle}>{copy.writeOrganizer}</OrderChatButton> : null}</div><strong>{new Intl.NumberFormat(INTL_LOCALES[locale], { style: "currency", currency: order.currency }).format(order.amount / 100)}</strong></article>)}</div>;
}

function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) { const copy = ACCOUNT_COPY[useLocale()]; return <nav className="account-pager" aria-label={copy.pages}><button className="account-button" disabled={page === 1} type="button" onClick={() => onPage(Math.max(1, page - 1))}>{copy.back}</button><span>{copy.page} {page}</span><button className="account-button" disabled={!hasNext} type="button" onClick={() => onPage(page + 1)}>{copy.next}</button></nav>; }
function ResourceError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="account-resource-error" role="alert"><p>{message}</p><button type="button" className="account-text-link" onClick={onRetry}>{ACCOUNT_REDESIGN_COPY[useLocale()].retry}</button></div>; }
function Loading() { return <p className="account-loading" role="status">{ACCOUNT_COPY[useLocale()].loading}</p>; }
function errorMessage(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }
