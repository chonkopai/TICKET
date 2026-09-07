"use client";

import { ru, type PublicEvent } from "@event-platform/shared-types";
import { useEffect, useState } from "react";

import { CheckoutPanel } from "./checkout-panel";
import { rememberRecentlyViewed } from "../../../lib/local-preferences";
import { BackLink } from "../../../components/back-link";
import { Countdown } from "../../../components/countdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void params.then(({ id }) => fetch(`/api/events/${id}`).then(async (response) => {
      if (!response.ok) throw new Error("not found");
      return response.json() as Promise<PublicEvent>;
    }).then((next) => { setEvent(next); rememberRecentlyViewed(next.id); }).catch(() => setError(true)));
  }, [params]);
  if (error) return <main className="mx-auto min-h-screen max-w-4xl px-5 py-16"><p className="rounded-2xl bg-zinc-100 p-6 text-center">{ru.publicEvent.notFound}</p></main>;
  if (!event) return <main className="mx-auto min-h-screen max-w-4xl px-5 py-16"><p>{ru.common.loading}</p></main>;
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:py-14">
    <BackLink href="/" label={ru.publicEvent.back} />
    <article className="mt-6 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
      {event.posterUrl ? <img className="max-h-[32rem] w-full object-cover" src={new URL(event.posterUrl, API_URL).toString()} alt={event.title} /> : null}
      <div className="p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-semibold tracking-tight">{event.title}</h1>{event.announcement ? <p className="mt-3 text-xl text-zinc-700">{event.announcement}</p> : null}</div><Countdown startsAt={event.startsAt} /></div>
        <p className="mt-6 text-zinc-700">{event.date} · {event.time} · {event.timezone}<br />{event.venueName}, {event.address}</p>
        <Section title={ru.events.fields.description} text={event.description} />
        <Section title={ru.events.fields.program} text={event.program} />
        <Section title={ru.events.fields.rules} text={event.rules} />
        <Section title={ru.events.fields.visitTerms} text={event.visitTerms} />
        <Section title={ru.events.fields.cancellationTerms} text={event.cancellationTerms} />
        <Section title={ru.events.fields.extraConditions} text={event.extraConditions} />
        {event.paymentMode === "deposit" ? <Section title={ru.events.fields.depositTerms} text={event.depositTerms} /> : null}
        <CheckoutPanel event={event} />
        <div className="mt-8 flex items-center gap-3 border-t border-zinc-200 pt-6">
          {event.organizer.photoUrl ? <img className="h-12 w-12 rounded-full object-cover" src={event.organizer.photoUrl} alt="" /> : null}
          <div><h2 className="font-semibold">{ru.publicEvent.organizer}</h2><p className="text-sm text-zinc-600">{event.organizer.name ?? ""}</p><p className="text-sm text-zinc-500">{event.organizer.contact ?? ru.publicEvent.contactUnavailable}</p></div>
        </div>
      </div>
    </article>
  </main>;
}

function Section({ title, text }: { title: string; text: string | null }) { return text ? <section className="mt-7"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700">{text}</p></section> : null; }
