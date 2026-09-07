import { Controller, Get, Header, Inject, Param, StreamableFile } from "@nestjs/common";

import { OBJECT_STORAGE } from "./events.constants.js";
import type { ObjectStorage } from "./object-storage.js";

@Controller("media/posters")
export class MediaController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Get(":key")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async read(@Param("key") key: string): Promise<StreamableFile> {
    const poster = await this.storage.readPoster(key);
    return new StreamableFile(poster.body, {
      type: poster.contentType,
      length: poster.body.byteLength,
      disposition: "inline",
    });
  }
}
