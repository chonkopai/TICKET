import { GuestOrderChat } from "../../../../../../organizer/events/_components/guest-order-chat";

export default async function GuestOrderChatPage({ params }: PageProps<"/my-events/events/[eventId]/orders/[orderId]/chat">) {
  const { eventId, orderId } = await params;
  return <GuestOrderChat eventId={eventId} orderId={orderId} />;
}
