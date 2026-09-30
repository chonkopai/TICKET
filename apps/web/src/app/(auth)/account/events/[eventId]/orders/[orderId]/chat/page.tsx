import { GuestOrderChat } from "../../../../../../../organizer/events/_components/guest-order-chat";

export default async function GuestOrderChatPage({ params }: { params: Promise<{ eventId: string; orderId: string }> }) {
  const { eventId, orderId } = await params;
  return <GuestOrderChat eventId={eventId} orderId={orderId} />;
}
