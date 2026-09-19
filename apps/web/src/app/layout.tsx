import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Navbar } from "../components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "TICKET — афиша событий",
  description: "События, билеты и любимые места в одном сервисе.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body><Navbar />{children}</body>
    </html>
  );
}
