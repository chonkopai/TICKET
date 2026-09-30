import { EventNotifications } from "../../_components/event-notifications";

export default async function EventNotificationsPage({ params }: PageProps<"/organizer/events/[id]/notifications">) {
  const { id } = await params;
  return <EventNotifications eventId={id} />;
}
