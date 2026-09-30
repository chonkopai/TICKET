import { EventScanner } from "../../_components/event-scanner";

export default async function EventScannerPage({ params }: PageProps<"/organizer/events/[id]/scanner">) {
  const { id } = await params;
  return <EventScanner eventId={id} />;
}
