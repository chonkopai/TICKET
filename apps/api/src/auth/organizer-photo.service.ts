import type { PrismaClient } from "@event-platform/database";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";

import { DATABASE_CLIENT } from "./auth.constants.js";
import { MAX_POSTER_BYTES, OBJECT_STORAGE } from "../events/events.constants.js";
import type { ObjectStorage, PutPosterInput, UploadedPoster } from "../events/object-storage.js";

@Injectable()
export class OrganizerPhotoService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(userId: string, file: UploadedPoster | undefined): Promise<{ photoUrl: string }> {
    const image = validateProfilePhoto(file);
    const stored = await this.storage.putPoster(image);
    let previous: string | null;
    try {
      previous = await this.database.$transaction(async (transaction) => {
        const user = await transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { photoUrl: true } });
        const changed = await transaction.user.updateMany({ where: { id: userId, photoUrl: user.photoUrl }, data: { photoUrl: stored.url } });
        if (changed.count !== 1) throw new ConflictException({ code: "PROFILE_PHOTO_CHANGED", message: "Profile photo changed; retry the upload" });
        await transaction.auditLog.create({ data: { actorId: userId, action: "organizer_profile.photo_updated", entityType: "user", entityId: userId, meta: { changedFields: ["photoUrl"] } } });
        await transaction.outboxEvent.create({ data: { eventType: "organizer_profile.photo_updated", aggregateType: "user", aggregateId: userId, payload: { changedFields: ["photoUrl"] } } });
        return user.photoUrl;
      });
    } catch (error) {
      await this.storage.deletePoster(stored.key);
      throw error;
    }
    const oldKey = previous?.match(/^\/media\/posters\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/)?.[1];
    if (oldKey) await this.storage.deletePoster(oldKey).catch(() => undefined);
    return { photoUrl: stored.url };
  }
}

function validateProfilePhoto(file: UploadedPoster | undefined): PutPosterInput {
  if (!file?.buffer?.length) throw new BadRequestException({ code: "PROFILE_PHOTO_REQUIRED", message: "Choose a photo" });
  if (file.size > MAX_POSTER_BYTES || file.buffer.byteLength > MAX_POSTER_BYTES) throw new BadRequestException({ code: "PROFILE_PHOTO_TOO_LARGE", message: "Photo must not exceed 5 MB" });
  const body = file.buffer;
  const detected = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
    ? { contentType: "image/jpeg", extension: "jpg" as const }
    : body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? { contentType: "image/png", extension: "png" as const }
      : body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP"
        ? { contentType: "image/webp", extension: "webp" as const }
        : null;
  if (!detected || detected.contentType !== file.mimetype.toLowerCase()) throw new BadRequestException({ code: "PROFILE_PHOTO_INVALID", message: "Use a valid JPEG, PNG or WebP image" });
  return { body, ...detected };
}
