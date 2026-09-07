"use client";

import type { AuthUser } from "@event-platform/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ru } from "@event-platform/shared-types";
import { clearSession, getSession } from "../app/(auth)/_lib/session";

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () => setUser(getSession()?.user ?? null);
    refresh();
    window.addEventListener("event-platform:session-changed", refresh);
    return () => window.removeEventListener("event-platform:session-changed", refresh);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const organizer = user?.role === "organizer" || user?.role === "admin";
  const links = [
    { href: "/", label: ru.common.home },
    { href: "/events", label: ru.common.events },
    ...(user ? [{ href: "/my-events", label: ru.guest.myEvents }] : []),
    ...(user ? [{ href: "/favorites", label: ru.favorites.title }] : []),
  ];

  function logout(): void {
    clearSession();
    setUser(null);
    window.location.assign("/");
  }

  return <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-[#f7f7f8]/95 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-6"><Link className="shrink-0 text-lg font-bold tracking-tight text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" href="/">Evently</Link><nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}</nav></div>
      <div className="flex items-center gap-2"><Link aria-label={user ? ru.common.profile : ru.auth.login} className="hidden rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:inline-flex" href={user ? "/account" : "/login"}>{user ? (user.name || ru.common.profile) : ru.auth.login}</Link>{organizer ? <Link className="hidden rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:inline-flex" href="/organizer/events">{ru.common.organizer}</Link> : null}{user ? <button className="hidden rounded-xl px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 sm:inline-flex" onClick={logout} type="button">Выйти</button> : null}<button aria-expanded={open} aria-label={open ? "Закрыть меню" : "Открыть меню"} className="rounded-xl border border-zinc-300 bg-white p-2 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600" onClick={() => setOpen((value) => !value)} type="button"><span aria-hidden="true" className="text-lg">{open ? "×" : "☰"}</span></button></div>
    </div>
    {open ? <nav className="border-t border-zinc-200 bg-white px-5 py-3 md:hidden" aria-label="Мобильная навигация">{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}{organizer ? <NavLink href="/organizer/events" label={ru.common.organizer} active={pathname.startsWith("/organizer")} /> : null}<Link className="mt-2 block rounded-xl border border-zinc-200 px-4 py-3 font-semibold" href={user ? "/account" : "/login"}>{user ? ru.common.profile : ru.auth.login}</Link>{user ? <button className="mt-2 block w-full rounded-xl px-4 py-3 text-left text-zinc-600" onClick={logout} type="button">Выйти</button> : null}</nav> : null}
  </header>;
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link className={`block rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${active ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`} href={href}>{label}</Link>;
}
