import { EventForm } from "../../_components/event-form";

export default async function EditOrganizerEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventForm eventId={id} />;
}
