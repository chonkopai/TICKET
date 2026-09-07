import { ru } from "@event-platform/shared-types";
import Link from "next/link";

export default function DevelopmentPaymentPage() {
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-16"><section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm"><h1 className="text-3xl font-semibold">{ru.checkout.developmentTitle}</h1><p className="mt-4 text-zinc-600">{ru.checkout.developmentDescription}</p><Link className="mt-6 inline-block underline" href="/my-events">{ru.guest.myEvents}</Link></section></main>;
}
