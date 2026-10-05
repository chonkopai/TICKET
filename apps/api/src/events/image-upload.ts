import { BadRequestException } from "@nestjs/common";
import { MAX_POSTER_BYTES } from "./events.constants.js";
import type { UploadedPoster } from "./object-storage.js";

export function validatePoster(file: UploadedPoster | undefined): {
  body: Buffer;
  contentType: string;
  extension: "jpg" | "png" | "webp";
} {
  if (!file?.buffer?.length) {
    throw new BadRequestException({ code: "POSTER_REQUIRED", message: "Poster file is required" });
  }
  if (file.size > MAX_POSTER_BYTES || file.buffer.byteLength > MAX_POSTER_BYTES) {
    throw new BadRequestException({
      code: "POSTER_TOO_LARGE",
      message: "Poster must not exceed 5 MB",
    });
  }

  const detected = detectImage(file.buffer);
  if (!detected || detected.contentType !== file.mimetype.toLowerCase()) {
    throw new BadRequestException({
      code: "POSTER_TYPE_INVALID",
      message: "Poster must be a valid JPEG, PNG, or WebP image",
    });
  }
  return { body: file.buffer, ...detected };
}

function detectImage(
  body: Buffer,
): { contentType: string; extension: "jpg" | "png" | "webp" } | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    body.length >= 8 &&
    body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString("ascii") === "RIFF" &&
    body.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}
