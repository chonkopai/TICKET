import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Navbar } from "../components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Event Platform",
  description: "Guest, organizer, and quick-purchase event experiences.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body><Navbar />{children}</body>
    </html>
  );
}
