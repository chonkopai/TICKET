"use client";

import { ru, type AccountDashboard, type AccountOrderList, type AuthUser, type GuestEventList, type NotificationPreferences, type TelegramLinkTokenResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { GuestEventCard } from "../../../components/guest-event-card";
import { PageShell } from "../../../components/ui";
import { ProtectedRoute } from "../_components/protected-route";
import { apiRequest } from "../_lib/api";
import { clearSession, getSession, updateSessionUser } from "../_lib/session";

type AccountTab = "tickets" | "profile" | "notifications" | "payments";
const TABS: Array<{ id: AccountTab; label: string }> = [
  { id: "tickets", label: "Мои билеты и заказы" },
  { id: "profile", label: "Личные данные и настройки" },
  { id: "notifications", label: "Telegram-бот и уведомления" },
  { id: "payments", label: "История оплат и чеки" },
];

export default function AccountPage() {
  return <PageShell className="max-w-7xl"><ProtectedRoute><Account /></ProtectedRoute></PageShell>;
}

function Account() {
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

  useEffect(() => {
    Promise.all([apiRequest<AuthUser>("/me"), apiRequest<AccountDashboard>("/me/dashboard"), apiRequest<NotificationPreferences>("/me/notification-preferences")])
      .then(([profile, totals, saved]) => { setUser(profile); updateSessionUser(profile); setDashboard(totals); setPreferences(saved); })
      .catch(showError(setMessage));
  }, []);

  useEffect(() => {
    setEvents(null);
    apiRequest<GuestEventList>(`/me/events?status=${eventStatus}&page=${eventPage}&limit=10`).then(setEvents).catch(showError(setMessage));
  }, [eventStatus, eventPage]);

  useEffect(() => {
    setOrders(null);
    apiRequest<AccountOrderList>(`/me/orders?page=${orderPage}&limit=10`).then(setOrders).catch(showError(setMessage));
  }, [orderPage]);

  useEffect(() => { setPhone(user?.phone ?? ""); setEmail(user?.email ?? ""); setDefaultCity(user?.defaultCity ?? ""); }, [user]);

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const profile = await apiRequest<AuthUser>("/me", { method: "PATCH", body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null, defaultCity: defaultCity.trim() || null }) });
      setUser(profile); updateSessionUser(profile); setMessage("Личные данные сохранены");
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
    try { const profile = await apiRequest<AuthUser>("/me/become-organizer", { method: "POST" }); setUser(profile); updateSessionUser(profile); setMessage(ru.account.organizerEnabled); }
    catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function linkTelegram(): Promise<void> {
    setBusy(true); setMessage(null);
    try { const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", { method: "POST" }); window.location.assign(link.deepLinkUrl); }
    catch (error) { setMessage(errorMessage(error)); setBusy(false); }
  }

  function logout(): void { clearSession(); window.location.assign("/login"); }
  const organizer = user?.role === "organizer" || user?.role === "admin";

  return <section>
    {organizer ? <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#26123f] px-5 py-4 text-white"><p className="font-semibold">Вы также управляете событиями как организатор</p><Link className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#5b21b6]" href="/organizer/events">Открыть кабинет организатора →</Link></div> : null}
    <div className="rounded-3xl border border-[#e2ddea] bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {user?.photoUrl ? <img alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-[#f0eaff]" src={user.photoUrl} /> : <div aria-hidden="true" className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[#ede5ff] text-3xl font-bold text-[#5b21b6]">{user?.name?.slice(0, 1).toUpperCase() || "T"}</div>}
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-extrabold sm:text-3xl">{user?.name || ru.account.telegramUser}</h1><span className="rounded-full bg-[#f0eaff] px-3 py-1 text-xs font-bold text-[#5b21b6]">{user ? ru.account.roles[user.role] : "…"}</span></div><p className="mt-1 text-sm text-[#665d70]">Telegram ID: {user?.telegramId ?? "…"}</p><p className="mt-1 text-sm text-[#665d70]">{user?.email || "Email не указан"} · {user?.phone || "Телефон не указан"}</p></div>
        </div>
        <button className="rounded-xl border border-[#d2cadc] px-4 py-2 text-sm font-semibold" onClick={() => setTab("profile")} type="button">Редактировать профиль</button>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2"><SummaryCard icon="▣" label="Активных билетов" value={dashboard?.activeAdmissions ?? "…"} /><SummaryCard icon="✓" label="Посещено событий" value={dashboard?.attendedEvents ?? "…"} /></div>
    </div>
    <div className="mt-6 overflow-x-auto border-b border-[#ded8e7]" role="tablist" aria-label="Разделы личного кабинета"><div className="flex min-w-max gap-1">{TABS.map((item) => <button aria-selected={tab === item.id} className={`border-b-2 px-4 py-4 text-sm font-bold transition ${tab === item.id ? "border-[#6425bd] text-[#6425bd]" : "border-transparent text-[#665d70] hover:text-[#26123f]"}`} key={item.id} onClick={() => setTab(item.id)} role="tab" type="button">{item.label}</button>)}</div></div>
    {message ? <p aria-live="polite" className="mt-5 rounded-xl bg-[#f2edff] px-4 py-3 text-sm text-[#3b176f]">{message}</p> : null}
    <div className="mt-6" role="tabpanel">
      {tab === "tickets" ? <TicketsPanel events={events} page={eventPage} status={eventStatus} onPage={setEventPage} onStatus={(value) => { setEventStatus(value); setEventPage(1); }} /> : null}
      {tab === "profile" ? <ProfilePanel busy={busy} city={defaultCity} email={email} phone={phone} organizer={organizer} onBecome={() => void becomeOrganizer()} onCity={setDefaultCity} onEmail={setEmail} onPhone={setPhone} onSave={saveProfile} /> : null}
      {tab === "notifications" ? <NotificationsPanel linked={Boolean(user?.telegramChatId)} preferences={preferences} busy={busy} onLink={() => void linkTelegram()} onChange={(key, value) => void savePreference(key, value)} /> : null}
      {tab === "payments" ? <PaymentsPanel orders={orders} page={orderPage} onPage={setOrderPage} /> : null}
    </div>
    <div className="mt-8 flex justify-end"><button className="text-sm font-semibold text-red-700" onClick={logout} type="button">Выйти из аккаунта</button></div>
  </section>;
}

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: number | string }) { return <div className="flex items-center gap-4 rounded-2xl bg-[#f7f4fb] p-5"><span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-white text-xl font-bold text-[#6425bd]">{icon}</span><div><p className="text-2xl font-extrabold">{value}</p><p className="text-sm text-[#665d70]">{label}</p></div></div>; }

function TicketsPanel({ events, page, status, onPage, onStatus }: { events: GuestEventList | null; page: number; status: "upcoming" | "past"; onPage: (page: number) => void; onStatus: (status: "upcoming" | "past") => void }) { return <div><div className="flex gap-2"><Pill active={status === "upcoming"} onClick={() => onStatus("upcoming")}>Предстоящие</Pill><Pill active={status === "past"} onClick={() => onStatus("past")}>Прошедшие</Pill></div>{!events ? <Loading /> : events.items.length ? <div className="mt-5 grid gap-4">{events.items.map((event) => <GuestEventCard event={event} key={event.id} />)}</div> : <Empty text={status === "upcoming" ? "У вас пока нет предстоящих событий" : "История посещений пока пуста"} />}{events && events.total > events.limit ? <Pager page={page} hasNext={events.hasNext} onPage={onPage} /> : null}</div>; }

function ProfilePanel({ busy, city, email, phone, organizer, onBecome, onCity, onEmail, onPhone, onSave }: { busy: boolean; city: string; email: string; phone: string; organizer: boolean; onBecome: () => void; onCity: (value: string) => void; onEmail: (value: string) => void; onPhone: (value: string) => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><form className="rounded-2xl border border-[#ded8e7] bg-white p-6" onSubmit={onSave}><h2 className="text-xl font-bold">Личные данные</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Телефон" value={phone} onChange={onPhone} /><Field label="Email" type="email" value={email} onChange={onEmail} /><Field label="Город по умолчанию" value={city} onChange={onCity} /></div><button className="mt-6 rounded-xl bg-[#5b21b6] px-5 py-3 font-bold text-white disabled:opacity-50" disabled={busy} type="submit">Сохранить изменения</button></form><aside className="rounded-2xl bg-[#26123f] p-6 text-white"><h2 className="text-xl font-bold">Роль в TICKET</h2><p className="mt-3 text-sm text-white/75">Создавайте события и управляйте продажами в отдельном кабинете.</p>{organizer ? <Link className="mt-6 inline-block rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6]" href="/organizer/events">Кабинет организатора</Link> : <button className="mt-6 rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6] disabled:opacity-60" disabled={busy} onClick={onBecome} type="button">Стать организатором</button>}</aside></div>; }

function NotificationsPanel({ linked, preferences, busy, onLink, onChange }: { linked: boolean; preferences: NotificationPreferences | null; busy: boolean; onLink: () => void; onChange: (key: keyof NotificationPreferences, value: boolean) => void }) { return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl bg-[#26123f] p-6 text-white"><p className="text-sm font-bold uppercase tracking-wider text-[#cdb9ee]">Telegram-бот</p><h2 className="mt-2 text-2xl font-bold">{linked ? "Бот подключён" : "Подключите бота"}</h2><p className="mt-3 text-sm text-white/70">Получайте билеты и напоминания в Telegram.</p>{!linked ? <button className="mt-6 rounded-xl bg-white px-5 py-3 font-bold text-[#5b21b6] disabled:opacity-50" disabled={busy} onClick={onLink} type="button">Подключить Telegram-бота</button> : <span className="mt-6 inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-sm font-bold text-emerald-200">Активен</span>}</div><div className="rounded-2xl border border-[#ded8e7] bg-white p-6"><h2 className="text-xl font-bold">Уведомления</h2><p className="mt-2 text-sm text-[#665d70]">Настройки будут использоваться системой доставки уведомлений.</p><div className="mt-4 divide-y divide-[#ece7f1]">{preferences ? <><Toggle label="Доставка билетов" description="Служебные сообщения после покупки" checked={preferences.transactionalTicketDelivery} onChange={(value) => onChange("transactionalTicketDelivery", value)} /><Toggle label="Напоминания о событиях" description="Дата, время и важные изменения" checked={preferences.eventReminders} onChange={(value) => onChange("eventReminders", value)} /><Toggle label="Новости и предложения" description="Маркетинговые объявления" checked={preferences.marketingAnnouncements} onChange={(value) => onChange("marketingAnnouncements", value)} /></> : <Loading />}</div></div></div>; }

function PaymentsPanel({ orders, page, onPage }: { orders: AccountOrderList | null; page: number; onPage: (page: number) => void }) { if (!orders) return <Loading />; if (!orders.items.length) return <Empty text="История оплат пока пуста" />; return <div className="rounded-2xl border border-[#ded8e7] bg-white"><div className="border-b border-[#ece7f1] p-6"><h2 className="text-xl font-bold">История оплат</h2><p className="mt-1 text-sm text-[#665d70]">Только операции вашего аккаунта</p></div><div className="divide-y divide-[#ece7f1]">{orders.items.map((order) => <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center" key={order.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{order.eventTitle}</p><span className="rounded-full bg-[#f1edf5] px-2.5 py-1 text-xs font-bold">{paymentStatus(order.status)}</span></div><p className="mt-1 text-sm text-[#665d70]">{order.itemSummary} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(order.createdAt))}</p><p className="mt-2 text-xs text-[#80758d]">Чек недоступен: платёжный провайдер не передал документ</p></div><p className="text-lg font-extrabold">{formatMoney(order.amount, order.currency)}</p></div>)}</div>{orders.total > orders.limit ? <div className="p-5"><Pager page={page} hasNext={orders.hasNext} onPage={onPage} /></div> : null}</div>; }

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-bold">{label}<input className="rounded-xl border border-[#d2cadc] bg-white px-4 py-3 font-normal outline-none focus:border-[#713dcc] focus:ring-2 focus:ring-[#e4d7fa]" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 py-4"><span><span className="block font-bold">{label}</span><span className="mt-1 block text-sm text-[#665d70]">{description}</span></span><input className="h-5 w-5 accent-[#6425bd]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function Pill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) { return <button className={`rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-[#5b21b6] text-white" : "border border-[#d2cadc] bg-white text-[#51485c]"}`} onClick={onClick} type="button">{children}</button>; }
function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (page: number) => void }) { return <nav className="mt-5 flex items-center justify-between" aria-label="Страницы"><button className="rounded-lg border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={page === 1} onClick={() => onPage(Math.max(1, page - 1))} type="button">Назад</button><span className="text-sm text-[#665d70]">Страница {page}</span><button className="rounded-lg border border-[#d2cadc] px-4 py-2 disabled:opacity-40" disabled={!hasNext} onClick={() => onPage(page + 1)} type="button">Далее</button></nav>; }
function Loading() { return <p className="mt-6 text-sm text-[#665d70]">Загрузка…</p>; }
function Empty({ text }: { text: string }) { return <div className="mt-5 rounded-2xl border border-dashed border-[#d2cadc] bg-white p-10 text-center text-[#665d70]">{text}</div>; }
function paymentStatus(status: string): string { return ({ pending: "Ожидает оплаты", paid: "Оплачено", failed: "Ошибка", cancelled: "Отменено", refunded: "Возвращено" } as Record<string, string>)[status] ?? status; }
function formatMoney(value: number, currency: string): string { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value / 100); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Не удалось выполнить запрос"; }
function showError(setter: (message: string) => void): (error: unknown) => void { return (error) => setter(errorMessage(error)); }
