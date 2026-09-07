import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { BookingModule } from "../booking/booking.module.js";
import { PublicEventsModule } from "../public-events/public-events.module.js";
import { TicketsModule } from "../tickets/tickets.module.js";
import { BotController } from "./bot.controller.js";
import { BotService } from "./bot.service.js";

@Module({
  imports: [AuthModule, BookingModule, PublicEventsModule, TicketsModule],
  controllers: [BotController],
  providers: [{ provide: DATABASE_CLIENT, useValue: prisma }, BotService],
})
export class BotModule {}
