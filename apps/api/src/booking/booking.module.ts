import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { DomainEventsService } from "../domain-events/domain-events.service.js";
import { TablesModule } from "../tables/tables.module.js";
import { TicketTypesModule } from "../ticket-types/ticket-types.module.js";
import { BookingController } from "./booking.controller.js";
import { BOOKING_CLOCK, BOOKING_CONFIG, PAYMENT_PROVIDER, SystemBookingClock } from "./booking.constants.js";
import { BookingService } from "./booking.service.js";
import { CheckoutCleanupService } from "./checkout-cleanup.service.js";
import { DevelopmentPaymentProvider } from "./payment-provider.js";
import { OrdersPaymentController, PaymentWebhookController } from "../payments/payments.controller.js";
import { PaymentService } from "../payments/payment.service.js";
import { AnonymousService, QUICK_CONFIG } from "../orders/anonymous.service.js";
import { AnonymousController, OrganizerPurchasesController } from "../orders/anonymous.controller.js";
import { QuickBotGuard, QuickRateGuard } from "../orders/quick.guards.js";
import { TicketsModule } from "../tickets/tickets.module.js";
import { QuickDeliveryService } from "../orders/quick-delivery.service.js";

@Module({
  imports: [AuthModule, TicketTypesModule, TablesModule, TicketsModule],
  controllers: [BookingController, OrdersPaymentController, PaymentWebhookController, AnonymousController, OrganizerPurchasesController],
  providers: [
    { provide: DATABASE_CLIENT, useValue: prisma },
    {
      provide: BOOKING_CONFIG,
      useFactory: () => {
        const env = loadApiEnv();
        return { checkoutTtlSeconds: env.CHECKOUT_TTL_SECONDS, cleanupIntervalSeconds: env.CHECKOUT_CLEANUP_INTERVAL_SECONDS };
      },
    },
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    {
      provide: PAYMENT_PROVIDER,
      useFactory: () => {
        const env = loadApiEnv();
        if (env.NODE_ENV === "production") {
          throw new Error("Development payment provider cannot run in production");
        }
        if (env.PAYMENT_PROVIDER_NAME !== "mock") throw new Error("The selected payment provider has no configured adapter");
        if (!env.PAYMENT_PROVIDER_WEBHOOK_SECRET || env.PAYMENT_PROVIDER_WEBHOOK_SECRET.length < 32) throw new Error("Configure a private payment webhook secret of at least 32 characters");
        return new DevelopmentPaymentProvider(env.WEB_ORIGIN, env.PAYMENT_PROVIDER_WEBHOOK_SECRET, env.PAYMENT_WEBHOOK_TOLERANCE_SECONDS);
      },
    },
    DomainEventsService,
    AnonymousService,
    QuickDeliveryService,
    QuickBotGuard,
    QuickRateGuard,
    { provide: QUICK_CONFIG, useFactory: () => {
      const env = loadApiEnv();
      return { botUsername: env.TELEGRAM_BOT_USERNAME, sessionSeconds: env.QUICK_SESSION_TTL_SECONDS, accessSeconds: env.QUICK_ACCESS_TTL_SECONDS, claimSeconds: env.QUICK_CLAIM_TTL_SECONDS };
    } },
    PaymentService,
    BookingService,
    CheckoutCleanupService,
  ],
  exports: [BookingService, AnonymousService],
})
export class BookingModule {}
