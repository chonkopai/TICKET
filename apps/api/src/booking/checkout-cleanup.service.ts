import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { BOOKING_CONFIG, type BookingConfig } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";

@Injectable()
export class CheckoutCleanupService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(BookingService) private readonly booking: BookingService,
    @Inject(BOOKING_CONFIG) private readonly config: BookingConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.booking.expireDueCheckouts(100), this.config.cleanupIntervalSeconds * 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
