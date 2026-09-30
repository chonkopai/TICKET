import { EventAnalytics } from "../../_components/event-analytics";

export default async function OrganizerEventAnalyticsPage({
  params,
}: PageProps<"/organizer/events/[id]/analytics">) {
  const { id } = await params;
  return <EventAnalytics eventId={id} />;
}
