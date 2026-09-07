import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { TABLES_CONFIG, type TablesConfig } from "./tables.constants.js";
import { TablesService } from "./tables.service.js";

@Injectable()
export class TableHoldCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TableHoldCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(TablesService) private readonly tables: TablesService,
    @Inject(TABLES_CONFIG) private readonly config: TablesConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tables.expireDueHolds(100).catch((error: unknown) => {
        this.logger.error("Table hold cleanup failed", error instanceof Error ? error.stack : String(error));
      });
    }, this.config.cleanupIntervalSeconds * 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
