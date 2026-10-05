import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { isLocale, localeUrl } from "../lib/locale";
import { LocaleProvider } from "../components/locale-provider";

import { Navbar } from "../components/navbar";
import { CurrencyProvider } from "../components/currency-provider";
import { ThemeProvider } from "../components/theme-provider";
import { THEME_BOOTSTRAP } from "../lib/theme";
import "./globals.css";

const META = {
  ru: { title: "TICKET — афиша событий", description: "Создавайте события и находите мероприятия других людей." },
  kk: { title: "TICKET — іс-шаралар афишасы", description: "Іс-шаралар жасаңыз және басқа адамдардың іс-шараларын табыңыз." },
  en: { title: "TICKET — events for everyone", description: "Create events and discover events made by other people." },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const value = requestHeaders.get("x-ticket-locale");
  const locale = isLocale(value) ? value : "ru";
  const path = requestHeaders.get("x-ticket-path") ?? "/";
  return {
    ...META[locale],
    alternates: { languages: {
      ru: localeUrl(path, "ru"),
      kk: localeUrl(path, "kk"),
      en: localeUrl(path, "en"),
      "x-default": localeUrl(path, "ru"),
    } },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const value = requestHeaders.get("x-ticket-locale");
  const locale = isLocale(value) ? value : "ru";
  return (
    <html lang={locale} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} /></head>
      <body><LocaleProvider locale={locale}><ThemeProvider><CurrencyProvider><Navbar />{children}</CurrencyProvider></ThemeProvider></LocaleProvider></body>
    </html>
  );
}
