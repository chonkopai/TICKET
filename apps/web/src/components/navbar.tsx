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
    { href: "/", label: "Афиша" },
    { href: "/favorites", label: "Избранное" },
    ...(user ? [{ href: "/my-events", label: ru.guest.myEvents }] : []),
  ];

  function logout(): void {
    clearSession();
    setUser(null);
    window.location.assign("/");
  }

  return <header className="sticky top-0 z-40 border-b border-[#eef0f8] bg-white/95 backdrop-blur-xl">
    <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8 lg:px-10">
      <div className="flex min-w-0 items-center gap-7"><Link className="shrink-0 text-xl font-extrabold tracking-[-0.04em] text-[#581db3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc]" href="/">TICKET</Link><nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}</nav></div>
      <div className="flex items-center gap-2">{organizer ? <Link className="hidden items-center gap-2 rounded-lg bg-[#f0f3ff] px-4 py-2.5 text-sm font-medium transition hover:bg-[#e2e8f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] sm:inline-flex" href="/organizer/events"><span aria-hidden="true" className="text-[#713dcc]">⇄</span>Кабинет организатора</Link> : null}<Link aria-label={user ? ru.common.profile : "Войти через Telegram"} className="hidden items-center gap-2 rounded-lg bg-[#5b21b6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#420093] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] focus-visible:ring-offset-2 sm:inline-flex" href={user ? "/account" : "/login"}><span aria-hidden="true">➤</span>{user ? (user.name || ru.common.profile) : "Войти через Telegram"}</Link>{user ? <button className="hidden rounded-lg px-3 py-2 text-sm text-[#4a4453] hover:bg-[#f0f3ff] lg:inline-flex" onClick={logout} type="button">Выйти</button> : null}<Link aria-label="Профиль" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#713dcc] font-semibold text-white sm:hidden" href={user ? "/account" : "/login"}>{user?.name?.slice(0, 1).toUpperCase() || "●"}</Link><button aria-expanded={open} aria-label={open ? "Закрыть меню" : "Открыть меню"} className="rounded-lg border border-[#ccc3d6] bg-white p-2 md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc]" onClick={() => setOpen((value) => !value)} type="button"><span aria-hidden="true" className="text-lg leading-none">{open ? "×" : "☰"}</span></button></div>
    </div>
    {open ? <nav className="border-t border-[#eef0f8] bg-white px-4 py-3 md:hidden" aria-label="Мобильная навигация">{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}{organizer ? <NavLink href="/organizer/events" label="Кабинет организатора" active={pathname.startsWith("/organizer")} /> : null}<Link className="mt-2 block rounded-lg border border-[#ccc3d6] px-4 py-3 font-semibold" href={user ? "/account" : "/login"}>{user ? ru.common.profile : "Войти через Telegram"}</Link>{user ? <button className="mt-2 block w-full rounded-lg px-4 py-3 text-left text-[#4a4453]" onClick={logout} type="button">Выйти</button> : null}</nav> : null}
  </header>;
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link aria-current={active ? "page" : undefined} className={`block rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#713dcc] ${active ? "bg-[#5b21b6] text-white" : "text-[#4a4453] hover:bg-[#f0f3ff] hover:text-[#151c27]"}`} href={href}>{label}</Link>;
}
