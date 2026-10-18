"use client";

import Link from "next/link";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { OrderChat } from "../../../../components/order-chat";
import { useLocale } from "../../../../components/locale-provider";
import { localeUrl } from "../../../../lib/locale";

export function OrganizerOrderChat({ eventId, orderId }: { eventId: string; orderId: string }) {
  const locale = useLocale();
  const copy = { ru: { back: "К управлению событием", title: "Сообщения по заказу" }, en: { back: "Back to event management", title: "Order messages" }, kk: { back: "Іс-шараны басқаруға", title: "Тапсырыс хабарлары" } }[locale];
  return <ProtectedRoute><main className="min-h-screen bg-ticket-bg px-4 py-6"><div className="mx-auto max-w-2xl rounded-2xl border border-ticket-border bg-ticket-surface p-5 sm:p-7"><Link className="font-semibold text-ticket-accent" href={localeUrl(`/organizer/events/${eventId}`, locale)}>← {copy.back}</Link><h1 className="mt-4 text-2xl font-bold">{copy.title} #{orderId.slice(0, 8).toUpperCase()}</h1><OrderChat eventId={eventId} orderId={orderId} mode="organizer" /></div></main></ProtectedRoute>;
}
