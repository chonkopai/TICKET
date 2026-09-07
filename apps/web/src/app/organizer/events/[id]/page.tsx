import { EventForm } from "../_components/event-form";
import Link from "next/link";
import { quickRu } from "@event-platform/shared-types";

export default async function EditOrganizerEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <><div className="mx-auto max-w-5xl px-6 pt-6"><Link className="underline" href={`/organizer/events/${id}/purchases`}>{quickRu.purchases}</Link></div><EventForm eventId={id} /></>;
}
