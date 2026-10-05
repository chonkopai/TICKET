"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { HOME_COPY } from "../app/home-copy";
import { CATALOG_QUERY_UPDATED, CATALOG_SEARCH_SUBMITTED } from "../lib/catalog-query-events";
import { savedCatalogLocation } from "../lib/catalog-location";
import { useLocale } from "./locale-provider";

export function HeaderSearch({ onDark = false }: { onDark?: boolean }) {
  const locale = useLocale();
  const copy = HOME_COPY[locale];
  const pathname = usePathname();
  const router = useRouter();
  const [value, setValue] = useState("");
  useEffect(() => {
    const sync = () => setValue(window.location.pathname === "/" ? new URLSearchParams(window.location.search).get("search") ?? "" : "");
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener(CATALOG_QUERY_UPDATED, sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener(CATALOG_QUERY_UPDATED, sync); };
  }, [pathname]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = new URL(pathname === "/" ? window.location.href : "/", window.location.origin);
    url.searchParams.set("lang", locale);
    if (pathname !== "/") {
      const saved = savedCatalogLocation();
      if (saved?.countryCode) { url.searchParams.set("countryCode", saved.countryCode); url.searchParams.set("city", saved.city); }
    }
    if (value.trim()) url.searchParams.set("search", value.trim());
    else url.searchParams.delete("search");
    url.searchParams.delete("page");
    const href = `${url.pathname}${url.search}`;
    if (pathname === "/") {
      window.history.pushState(null, "", href);
      window.dispatchEvent(new Event(CATALOG_SEARCH_SUBMITTED));
    } else router.push(href);
  }
  return <form role="search" aria-label={copy.searchLabel} onSubmit={submit} className={`order-3 mb-3 flex h-10 w-full min-w-0 items-center rounded-full border pl-4 pr-1 focus-within:ring-2 xl:order-none xl:mb-0 xl:w-auto xl:flex-1 ${onDark ? "border-white/25 bg-white/15 text-white focus-within:border-white/60 focus-within:ring-white/20" : "border-slate-200 dark:border-ticket-border bg-slate-50 dark:bg-ticket-bg focus-within:border-violet-300 dark:focus-within:border-ticket-accent focus-within:ring-violet-100 dark:focus-within:ring-ticket-accent"}`}>
    <input aria-label={copy.searchLabel} className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${onDark ? "text-white placeholder:text-white/70" : "placeholder:text-slate-400 dark:placeholder:text-ticket-dim"}`} type="search" maxLength={120} placeholder={copy.searchLabel} value={value} onChange={event => setValue(event.target.value)} />
    <button type="submit" aria-label={copy.search} title={copy.search} className="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#6320ee] dark:bg-ticket-primary text-white hover:bg-[#4f16c8] dark:hover:bg-ticket-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent focus-visible:ring-offset-2"><svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
  </form>;
}
