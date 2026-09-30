import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { BOOKING_CONFIG, type BookingConfig } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";
import { RefundService } from "./refund.service.js";

@Injectable()
export class CheckoutCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(BookingService) private readonly booking: BookingService,
    @Inject(RefundService) private readonly refunds: RefundService,
    @Inject(BOOKING_CONFIG) private readonly config: BookingConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.booking.expireDueCheckouts(100).catch((error: unknown) => {
        this.logger.error("Checkout cleanup failed", error);
      });
      void this.refunds.processPending(20).catch((error: unknown) => {
        this.logger.error("Refund reconciliation failed", error);
      });
    }, this.config.cleanupIntervalSeconds * 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
