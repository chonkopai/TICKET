import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { EVENTS_CONFIG, OBJECT_STORAGE, type EventsConfig } from "./events.constants.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { LocalObjectStorage } from "./local-object-storage.service.js";
import { MediaController } from "./media.controller.js";
import { PublicEventsModule } from "../public-events/public-events.module.js";

@Module({
  imports: [AuthModule, PublicEventsModule],
  controllers: [EventsController, MediaController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    {
      provide: EVENTS_CONFIG,
      useFactory: (): EventsConfig => ({
        posterStorageDirectory: loadApiEnv().POSTER_STORAGE_DIR,
      }),
    },
    LocalObjectStorage,
    { provide: OBJECT_STORAGE, useExisting: LocalObjectStorage },
    DomainEventsService,
    EventsService,
  ],
})
export class EventsModule {}
