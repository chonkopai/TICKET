import { VenueBuilder } from "../_components/venue-builder";

export default async function VenueBuilderPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <VenueBuilder eventId={eventId} />;
}
