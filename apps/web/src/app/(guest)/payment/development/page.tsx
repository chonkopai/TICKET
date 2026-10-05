import { ru } from "@event-platform/shared-types";
import Link from "next/link";

export default function DevelopmentPaymentPage() {
  return <main className="mx-auto min-h-screen max-w-xl px-5 py-16"><section className="rounded-3xl border border-black/10 dark:border-ticket-border bg-white dark:bg-ticket-surface p-8 shadow-sm"><h1 className="text-3xl font-semibold">{ru.checkout.developmentTitle}</h1><p className="mt-4 text-zinc-600 dark:text-ticket-muted">{ru.checkout.developmentDescription}</p><Link className="mt-6 inline-block underline" href="/account">{ru.guest.profile}</Link></section></main>;
}
