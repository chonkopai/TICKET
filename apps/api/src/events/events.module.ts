import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { EVENTS_CONFIG, OBJECT_STORAGE, type EventsConfig } from "./events.constants.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { EventNotificationsController, EventTicketResendController } from "./event-notifications.controller.js";
import { EventNotificationsService } from "./event-notifications.service.js";
import { MarketingCampaignController } from "./marketing-campaign.controller.js";
import { MarketingCampaignService } from "./marketing-campaign.service.js";
import { TransactionalNotificationsService } from "./transactional-notifications.service.js";
import { AnonymousEventChatController, GuestEventChatController, OrganizerEventChatController } from "./event-chat.controller.js";
import { EventChatService } from "./event-chat.service.js";
import { QuickRateGuard } from "../orders/quick.guards.js";
import { LocalObjectStorage } from "./local-object-storage.service.js";
import { MediaController } from "./media.controller.js";
import { PublicEventsModule } from "../public-events/public-events.module.js";

@Module({
  imports: [AuthModule, PublicEventsModule],
  controllers: [EventsController, MediaController, EventNotificationsController, EventTicketResendController, MarketingCampaignController, OrganizerEventChatController, GuestEventChatController, AnonymousEventChatController],
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
    EventNotificationsService,
    MarketingCampaignService,
    TransactionalNotificationsService,
    EventChatService,
    QuickRateGuard,
  ],
})
export class EventsModule {}
