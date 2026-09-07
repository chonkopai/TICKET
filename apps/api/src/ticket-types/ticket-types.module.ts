import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TicketTypesController } from "./ticket-types.controller.js";
import { TicketTypesService } from "./ticket-types.service.js";

@Module({
  imports: [AuthModule],
  controllers: [TicketTypesController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    DomainEventsService,
    TicketTypesService,
  ],
  exports: [TicketTypesService],
})
export class TicketTypesModule {}
