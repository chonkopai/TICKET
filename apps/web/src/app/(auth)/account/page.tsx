"use client";

import { ru, type AuthUser, type TelegramLinkTokenResponse } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ProtectedRoute } from "../_components/protected-route";
import { apiRequest } from "../_lib/api";
import { clearSession, getSession, updateSessionUser } from "../_lib/session";
import { PageShell } from "../../../components/ui";
import { BackLink } from "../../../components/back-link";

export default function AccountPage() {
  return (
    <PageShell className="max-w-3xl py-10 sm:py-16">
      <ProtectedRoute>
        <Account />
      </ProtectedRoute>
    </PageShell>
  );
}

function Account() {
  const [user, setUser] = useState<AuthUser | null>(() => getSession()?.user ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setPhone(user?.phone ?? "");
    setEmail(user?.email ?? "");
  }, [user?.phone, user?.email]);

  useEffect(() => {
    apiRequest<AuthUser>("/me")
      .then((profile) => {
        setUser(profile);
        updateSessionUser(profile);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : ru.account.loadFailed),
      );
  }, []);

  async function becomeOrganizer(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const profile = await apiRequest<AuthUser>("/me/become-organizer", { method: "POST" });
      setUser(profile);
      updateSessionUser(profile);
      setMessage(ru.account.organizerEnabled);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ru.account.organizerFailed);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const profile = await apiRequest<AuthUser>("/me", {
        method: "PATCH",
        body: JSON.stringify({ phone: phone.trim() || null, email: email.trim() || null }),
      });
      setUser(profile);
      updateSessionUser(profile);
      setMessage(ru.guest.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ru.account.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function linkTelegram(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", {
        method: "POST",
      });
      window.location.assign(link.deepLinkUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ru.account.linkFailed);
      setBusy(false);
    }
  }

  function logOut(): void {
    clearSession();
    window.location.assign("/login");
  }

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {ru.account.title}
          </p>
          <div className="mt-2 flex items-center gap-3">{user?.photoUrl ? <img alt="" className="h-12 w-12 rounded-full object-cover" src={user.photoUrl} /> : null}<h1 className="text-3xl font-semibold">{user?.name || ru.account.telegramUser}</h1></div>
        </div>
        <button className="text-sm text-zinc-500 underline" onClick={logOut} type="button">
          {ru.account.logout}
        </button>
      </div>

      <dl className="mt-8 grid gap-4 rounded-2xl bg-zinc-50 p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{ru.account.role}</dt>
          <dd className="font-medium">{user ? ru.account.roles[user.role] : "…"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{ru.account.telegramId}</dt>
          <dd className="font-mono">{user?.telegramId ?? "…"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">{ru.account.botChat}</dt>
          <dd>{user?.telegramChatId ? ru.account.linked : ru.account.notLinked}</dd>
        </div>
      </dl>

      <form className="mt-6 grid gap-4 rounded-2xl border border-zinc-200 p-5" onSubmit={(event) => void saveProfile(event)}>
        <label className="grid gap-2 text-sm font-semibold">{ru.guest.phone}<input className="rounded-xl border border-zinc-300 px-4 py-3 font-normal" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-semibold">{ru.guest.email}<input className="rounded-xl border border-zinc-300 px-4 py-3 font-normal" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <button className="justify-self-start rounded-xl border border-black/15 px-5 py-3 font-semibold disabled:opacity-50" disabled={busy} type="submit">{ru.guest.saveProfile}</button>
      </form>

      <div className="mt-6 flex flex-wrap gap-3">
        {user?.role === "guest" ? (
          <button
            className="rounded-xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void becomeOrganizer()}
            type="button"
          >
            {ru.account.becomeOrganizer}
          </button>
        ) : null}
        <button
          className="rounded-xl border border-black/15 px-5 py-3 font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() => void linkTelegram()}
          type="button"
        >
          {ru.account.linkBot}
        </button>
        {user?.role === "organizer" || user?.role === "admin" ? (
          <Link className="rounded-xl bg-black px-5 py-3 font-semibold text-white" href="/organizer/events">
            {ru.home.organizerEvents}
          </Link>
        ) : null}
        <Link className="rounded-xl border border-black/15 px-5 py-3 font-semibold" href="/my-events">{ru.guest.myEvents}</Link>
      </div>
      {message ? <p className="mt-5 text-sm text-zinc-700">{message}</p> : null}
      <BackLink className="mt-8" href="/" label={ru.account.home} />
    </section>
  );
}
