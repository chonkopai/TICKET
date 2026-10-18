import { OrganizerOrderChat } from "../../../../_components/organizer-order-chat";

export default async function OrganizerOrderChatPage({ params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  return <OrganizerOrderChat eventId={id} orderId={orderId} />;
}
