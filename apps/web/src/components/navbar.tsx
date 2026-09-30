"use client";

import type { AuthUser } from "@event-platform/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getSession } from "../app/(auth)/_lib/session";
import { logoutSession } from "../app/(auth)/_lib/api";
import { OptionPicker } from "./option-picker";
import { CatalogLocationPicker } from "./catalog-location-picker";
import { useLocale } from "./locale-provider";
import { localeUrl } from "../lib/locale";
import type { EventLocale } from "@event-platform/shared-types";
import { NAV_COPY } from "./navbar-copy";

const LANGUAGE_OPTIONS = [
  { value: "ru", label: "Русский" },
  { value: "kk", label: "Қазақша" },
  { value: "en", label: "English" },
];

export function Navbar() {
  const locale = useLocale();
  const copy = NAV_COPY[locale];
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setUser(getSession()?.user ?? null);
    refresh();
    window.addEventListener("event-platform:session-changed", refresh);
    return () => window.removeEventListener("event-platform:session-changed", refresh);
  }, []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => setPhotoFailed(false), [user?.photoUrl]);

  const isManagementScreen = /^\/organizer\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname);
  if (pathname === "/login" || pathname.startsWith("/organizer/venue-builder/") || isManagementScreen) return null;

  const organizer = user?.role === "organizer" || user?.role === "admin";
  const createHref = !user ? "/login?returnTo=%2Faccount%3Ftab%3Dprofile" : organizer ? "/organizer/events/new" : "/account?tab=profile";
  const links = [
    { href: "/", label: copy.catalog },
    { href: "/favorites", label: copy.favorites },
    ...(user ? [{ href: "/my-events", label: copy.myEvents }] : []),
  ];

  async function logout(): Promise<void> {
    setLogoutError(null);
    try { await logoutSession(); window.location.assign("/"); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : copy.logoutFailed); }
  }

  function switchLocale(value: string): void {
    if (value !== "ru" && value !== "kk" && value !== "en") return;
    window.location.assign(localeUrl(`${window.location.pathname}${window.location.search}${window.location.hash}`, value as EventLocale));
  }

  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const photoUrl = user?.photoUrl ? new URL(user.photoUrl, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString() : null;
  const photo = photoUrl && !photoFailed ? <img alt="" className="h-full w-full rounded-full object-cover" onError={() => setPhotoFailed(true)} src={photoUrl} /> : initials || <UserIcon />;

  return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
    <div className="mx-auto flex min-h-[60px] max-w-7xl items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3 lg:gap-5"><Link className="inline-flex shrink-0 items-center gap-1.5 text-xl font-extrabold tracking-[-0.04em] text-[#6320ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" href="/">TICKET</Link>{pathname === "/" ? <CatalogLocationPicker /> : null}<nav className="hidden items-center gap-1 xl:flex" aria-label={copy.navigation}>{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}</nav></div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center lg:flex">
          <div>
            <OptionPicker appearance="bare" icon={<LanguageIcon />} label={copy.language} value={locale} options={LANGUAGE_OPTIONS} onChange={switchLocale} />
          </div>
        </div>
        <button aria-expanded={open} aria-label={open ? copy.closeMenu : copy.openMenu} className="rounded-full border border-slate-200 bg-white p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 xl:hidden" onClick={() => setOpen((value) => !value)} type="button"><span aria-hidden="true" className="text-lg leading-none">{open ? "×" : "☰"}</span></button>
        <Link className="hidden min-h-10 items-center justify-center gap-1.5 rounded-full border border-violet-200 px-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 md:inline-flex" href={createHref}><CreateEventIcon />{copy.createEvent}</Link>
        <Link aria-label={user ? copy.profile : copy.account} className="hidden items-center gap-2 rounded-full bg-[#6320ee] py-1.5 pl-1.5 pr-3.5 text-sm font-semibold text-white transition hover:bg-[#4f16c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 sm:inline-flex" href={user ? "/account" : "/login"}><span aria-hidden="true" className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-white/20 text-xs">{photo}</span>{user ? (user.name || copy.profile) : copy.account}</Link>
        <Link aria-label={copy.profile} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#6320ee] font-semibold text-white sm:hidden" href={user ? "/account" : "/login"}>{photo}</Link>
        {user ? <button aria-label={copy.logout} className="hidden rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:inline-flex" onClick={logout} title={copy.logout} type="button"><LogoutIcon /></button> : null}
      </div>
    </div>
    {logoutError ? <p role="alert" className="mx-auto max-w-7xl px-4 py-2 text-sm text-red-700">{logoutError}</p> : null}
    {open ? <nav className="border-t border-slate-200 bg-white px-4 py-3 xl:hidden" aria-label={copy.mobileNavigation}>{links.map((link) => <NavLink href={link.href} label={link.label} active={pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href))} key={link.href} />)}{organizer ? <NavLink href="/organizer/events" label={copy.organizer} active={pathname.startsWith("/organizer")} /> : null}<Link className="mt-2 inline-flex w-full items-center gap-2 rounded-full border border-violet-200 px-4 py-3 font-semibold text-violet-700" href={createHref}><CreateEventIcon />{copy.createEvent}</Link><div className="mt-3"><OptionPicker appearance="bare" icon={<LanguageIcon />} label={copy.language} value={locale} options={LANGUAGE_OPTIONS} onChange={switchLocale} /></div><Link className="mt-2 block rounded-full border border-slate-200 px-4 py-3 font-semibold" href={user ? "/account" : "/login"}>{user ? copy.profile : copy.account}</Link>{user ? <button className="mt-2 inline-flex w-full items-center gap-2 rounded-full px-4 py-3 text-left text-slate-600 hover:bg-slate-100" onClick={() => void logout()} type="button"><LogoutIcon />{copy.logout}</button> : null}</nav> : null}
  </header>;
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return <Link aria-current={active ? "page" : undefined} className={`block rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? "bg-[#6320ee] text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`} href={href}>{label}</Link>;
}

function LogoutIcon() { return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M17 16l4-4m0 0-4-4m4 4H8m5 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>; }
function LanguageIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-violet-600" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z" stroke="currentColor" strokeWidth="1.8" /></svg>; }
function CreateEventIcon() { return <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24"><rect height="16" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" /><path d="M7 3v4M17 3v4M3 10h18M12 13v6m-3-3h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>; }
function UserIcon() { return <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>; }
