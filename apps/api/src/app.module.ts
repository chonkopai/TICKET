import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthController } from "./health.controller.js";
import { TicketTypesModule } from "./ticket-types/ticket-types.module.js";
import { TicketsModule } from "./tickets/tickets.module.js";
import { VenueModule } from "./venue/venue.module.js";
import { MyEventsModule } from "./my-events/my-events.module.js";
import { PublicEventsModule } from "./public-events/public-events.module.js";
import { BookingModule } from "./booking/booking.module.js";
import { BotModule } from "./bot/bot.module.js";
import { FavoritesModule } from "./favorites/favorites.module.js";

@Module({
  imports: [AuthModule, EventsModule, TicketTypesModule, TicketsModule, VenueModule, MyEventsModule, PublicEventsModule, FavoritesModule, BookingModule, BotModule],
  controllers: [HealthController],
})
export class AppModule {}
