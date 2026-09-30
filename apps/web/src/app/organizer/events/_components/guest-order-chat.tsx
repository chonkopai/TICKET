"use client";

import Link from "next/link";
import { ProtectedRoute } from "../../../(auth)/_components/protected-route";
import { OrderChat } from "../../../../components/order-chat";
import { useLocale } from "../../../../components/locale-provider";
import { localeUrl } from "../../../../lib/locale";

const COPY = {
  ru: { account: "Личный кабинет", title: "Переписка с организатором" },
  kk: { account: "Жеке кабинет", title: "Ұйымдастырушымен хат алмасу" },
  en: { account: "Account", title: "Conversation with organizer" },
} as const;

export function GuestOrderChat({ eventId, orderId }: { eventId: string; orderId: string }) {
  const locale = useLocale();
  const copy = COPY[locale];
  return <ProtectedRoute><main className="min-h-screen bg-[#f9f9ff] px-4 py-6"><div className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm sm:p-7"><Link href={localeUrl("/account", locale)} className="text-sm font-semibold text-[#5b21b6]">← {copy.account}</Link><h1 className="mt-4 text-2xl font-bold">{copy.title}</h1><OrderChat eventId={eventId} orderId={orderId} mode="guest" /></div></main></ProtectedRoute>;
}
