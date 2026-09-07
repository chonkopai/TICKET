import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { GuestTicketsController, TicketsController } from "./tickets.controller.js";
import { TicketsService } from "./tickets.service.js";

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [TicketsController, GuestTicketsController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    DomainEventsService,
    TicketsService,
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
