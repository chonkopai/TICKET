import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { PublicEventsModule } from "../public-events/public-events.module.js";
import { FavoritesController } from "./favorites.controller.js";
import { FavoritesService } from "./favorites.service.js";

@Module({
  imports: [AuthModule, PublicEventsModule],
  controllers: [FavoritesController],
  providers: [{ provide: DATABASE_CLIENT, useValue: prisma }, FavoritesService],
})
export class FavoritesModule {}
