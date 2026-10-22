import type { Prisma, PrismaClient } from "@event-platform/database";

/** Recover purchases using persisted, verified identities, never receipt-link storage or profile email. */
export async function linkGuestPurchases(database: PrismaClient, userId: string): Promise<number> {
  return database.$transaction(async tx => {
    // Identity mutations use this same lock. Concurrent logins/account requests serialize here.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`identity-user:${userId}`}, 0))`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { telegramId: true, contactIdentities: { where: { method: "email" }, select: { normalizedIdentifier: true } } } });
    if (!user) return 0;
    const identities: Prisma.AnonymousCheckoutSessionWhereInput[] = [];
    if (user.telegramId !== null) identities.push({ telegramId: user.telegramId });
    const emails = user.contactIdentities.map(identity => identity.normalizedIdentifier);
    // Preserve the checkout's primary recipient: an email delivery address cannot take a Telegram buyer's order.
    if (emails.length) identities.push({ telegramId: null, verifiedEmail: { in: emails } });
    if (!identities.length) return 0;
    const matching: Prisma.AnonymousCheckoutSessionWhereInput = { OR: identities, claimedAt: null, orderId: { not: null } };
    const sessions = await tx.anonymousCheckoutSession.findMany({ where: { ...matching, order: { buyerUserId: null, paymentStatus: { in: ["paid", "refunded", "cancelled"] } } }, orderBy: { orderId: "asc" }, select: { id: true, orderId: true } });
    let linked = 0;
    for (const candidate of sessions) {
      const orderId = candidate.orderId!;
      // Share the order lock with explicit receipt claims and payment settlement.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`;
      const session = await tx.anonymousCheckoutSession.findFirst({ where: { ...matching, id: candidate.id, orderId }, select: { id: true } });
      if (!session) continue;
      const changed = await tx.order.updateMany({ where: {
        id: orderId, buyerUserId: null, paymentStatus: { in: ["paid", "refunded", "cancelled"] },
        tickets: { none: { ownerUserId: { not: null }, NOT: { ownerUserId: userId } } },
      }, data: { buyerUserId: userId } });
      if (!changed.count) continue;
      await tx.ticket.updateMany({ where: { orderId, ownerUserId: null }, data: { ownerUserId: userId } });
      await tx.anonymousCheckoutSession.update({ where: { id: session.id }, data: { claimedAt: new Date(), claimHash: null, claimExpiresAt: null } });
      await tx.chatMessage.updateMany({ where: { orderId, guestUserId: null }, data: { guestUserId: userId } });
      await tx.auditLog.create({ data: { actorId: userId, action: "order.claimed", entityType: "order", entityId: orderId, meta: { automatic: true } } });
      await tx.outboxEvent.create({ data: { eventType: "order.claimed", aggregateType: "order", aggregateId: orderId, payload: { userId } } });
      linked++;
    }
    return linked;
  }, { timeout: 30_000 });
}
