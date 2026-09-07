import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesModule } from "../tables/tables.module.js";
import { VenueController } from "./venue.controller.js";
import { VenueService } from "./venue.service.js";

@Module({
  imports: [AuthModule, TablesModule],
  controllers: [VenueController],
  providers: [{ provide: DATABASE_CLIENT, useValue: prisma }, DomainEventsService, VenueService],
})
export class VenueModule {}
