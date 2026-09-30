import { redirect } from "next/navigation";
import { EventManagement } from "../_components/event-management";

export default async function LegacyEditOrganizerEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  if (typeof step === "string") redirect(`/organizer/events/${id}/edit?step=${encodeURIComponent(step)}`);
  return <EventManagement eventId={id} />;
}
