import type { Prisma } from "@event-platform/database";
import { Injectable } from "@nestjs/common";

type OutboxDatabase = Pick<Prisma.TransactionClient, "outboxEvent">;

export interface AppendDomainEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
}

@Injectable()
export class DomainEventsService {
  append(database: OutboxDatabase, input: AppendDomainEventInput): Promise<unknown> {
    return database.outboxEvent.create({ data: input });
  }
}
