export const BOOKING_CONFIG = Symbol("BOOKING_CONFIG");
export const BOOKING_CLOCK = Symbol("BOOKING_CLOCK");
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface BookingConfig {
  checkoutTtlSeconds: number;
  cleanupIntervalSeconds: number;
}

export interface BookingClock {
  now(): Date;
}

export class SystemBookingClock implements BookingClock {
  now(): Date {
    return new Date();
  }
}
