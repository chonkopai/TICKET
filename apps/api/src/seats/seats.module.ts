import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesModule } from "../tables/tables.module.js";
import { OrganizerSeatsController, PublicSeatsController } from "./seats.controller.js";
import { SeatsService } from "./seats.service.js";

@Module({
  imports: [AuthModule, TablesModule],
  controllers: [OrganizerSeatsController, PublicSeatsController],
  providers: [{ provide: DATABASE_CLIENT, useValue: prisma }, DomainEventsService, SeatsService],
  exports: [SeatsService],
})
export class SeatsModule {}
