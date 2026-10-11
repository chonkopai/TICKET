import type { Metadata } from "next";
import { TelegramCallbackClient } from "./telegram-callback-client";

export const metadata: Metadata = { title: "Telegram — TICKET", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function TelegramCallbackPage() { return <TelegramCallbackClient />; }
