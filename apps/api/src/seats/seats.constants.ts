export const SEATS_CLOCK = Symbol("SEATS_CLOCK");

export interface SeatsClock {
  now(): Date;
}

export class SystemSeatsClock implements SeatsClock {
  now(): Date { return new Date(); }
}
