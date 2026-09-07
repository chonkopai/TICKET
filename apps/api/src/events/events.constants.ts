export const EVENTS_CONFIG = Symbol("EVENTS_CONFIG");
export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

export const MAX_POSTER_BYTES = 5 * 1_024 * 1_024;

export interface EventsConfig {
  posterStorageDirectory: string;
}
