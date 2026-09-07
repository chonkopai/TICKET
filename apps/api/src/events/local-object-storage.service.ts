import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { EVENTS_CONFIG, type EventsConfig } from "./events.constants.js";
import type { ObjectStorage, PutPosterInput, ReadablePosterObject } from "./object-storage.js";

const KEY_PATTERN = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

@Injectable()
export class LocalObjectStorage implements ObjectStorage {
  private readonly directory: string;

  constructor(@Inject(EVENTS_CONFIG) config: EventsConfig) {
    this.directory = isAbsolute(config.posterStorageDirectory)
      ? config.posterStorageDirectory
      : resolve(process.cwd(), config.posterStorageDirectory);
  }

  async putPoster(input: PutPosterInput): Promise<{ key: string; url: string }> {
    await mkdir(this.directory, { recursive: true });
    const key = `${randomUUID()}.${input.extension}`;
    await writeFile(join(this.directory, key), input.body, { flag: "wx" });
    return { key, url: `/media/posters/${key}` };
  }

  async readPoster(key: string): Promise<ReadablePosterObject> {
    this.assertKey(key);
    try {
      return {
        body: await readFile(join(this.directory, key)),
        contentType: contentTypeFor(key),
      };
    } catch (error) {
      if (isMissingFile(error)) {
        throw new NotFoundException({ code: "POSTER_NOT_FOUND", message: "Poster was not found" });
      }
      throw error;
    }
  }

  async deletePoster(key: string): Promise<void> {
    this.assertKey(key);
    try {
      await unlink(join(this.directory, key));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  private assertKey(key: string): void {
    if (!KEY_PATTERN.test(key)) {
      throw new NotFoundException({ code: "POSTER_NOT_FOUND", message: "Poster was not found" });
    }
  }
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
