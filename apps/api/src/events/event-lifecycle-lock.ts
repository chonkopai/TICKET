import type { Prisma } from "@event-platform/database";

/** Share the event row lock with organizer/staff lifecycle changes. Hold it
 * until admission or settlement commits, and read state only after locking. */
export async function lockEventLifecycle(transaction: Prisma.TransactionClient, eventId: string) {
  const rows = await transaction.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM "Event" WHERE id = ${eventId}::uuid FOR SHARE
  `;
  return rows[0];
}

/** Resolve membership from relations, including historical deposit/table orders,
 * rather than trusting the checkout's presentation snapshot. Caller owns order lock. */
export async function orderEventsArePublished(transaction: Prisma.TransactionClient, orderId: string): Promise<boolean> {
  const events = await transaction.event.findMany({
    where: { OR: [
      { ticketTypes: { some: { tickets: { some: { orderId } } } } },
      { ticketTypes: { some: { reservations: { some: { orderId } } } } },
      { venueLayout: { tables: { some: { bookings: { some: { orderId } } } } } },
      { venueLayout: { seats: { some: { allocations: { some: { orderId } } } } } },
      { deposits: { some: { orderId } } },
    ] },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let published = events.length > 0;
  for (const event of events) {
    const current = await lockEventLifecycle(transaction, event.id);
    if (current?.status !== "published") published = false;
  }
  return published;
}
