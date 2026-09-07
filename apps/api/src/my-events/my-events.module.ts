import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { MyEventsController } from "./my-events.controller.js";
import { MyEventsService } from "./my-events.service.js";

@Module({
  imports: [AuthModule],
  controllers: [MyEventsController],
  providers: [{ provide: DATABASE_CLIENT, useValue: prisma }, MyEventsService],
})
export class MyEventsModule {}
