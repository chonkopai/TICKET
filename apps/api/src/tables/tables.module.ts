import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TableHoldCleanupService } from "./table-hold-cleanup.service.js";
import { OrganizerTablesController, PublicTablesController } from "./tables.controller.js";
import { TABLES_CLOCK, TABLES_CONFIG, SystemClock, type TablesConfig } from "./tables.constants.js";
import { TablesService } from "./tables.service.js";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerTablesController, PublicTablesController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    {
      provide: TABLES_CONFIG,
      useFactory: (): TablesConfig => {
        const env = loadApiEnv();
        return {
          holdTtlSeconds: env.TABLE_HOLD_TTL_SECONDS,
          cleanupIntervalSeconds: env.TABLE_HOLD_CLEANUP_INTERVAL_SECONDS,
        };
      },
    },
    { provide: TABLES_CLOCK, useClass: SystemClock },
    DomainEventsService,
    TablesService,
    TableHoldCleanupService,
  ],
  exports: [TablesService],
})
export class TablesModule {}
