export const TABLES_CONFIG = Symbol("TABLES_CONFIG");
export const TABLES_CLOCK = Symbol("TABLES_CLOCK");

export interface TablesConfig {
  holdTtlSeconds: number;
  cleanupIntervalSeconds: number;
}

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
