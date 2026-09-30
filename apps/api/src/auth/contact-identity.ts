import { BadRequestException } from "@nestjs/common";
import { isEmail } from "class-validator";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type ContactMethod = "email" | "phone";

/** Canonical lookup key for verified identities and verification challenges. */
export function normalizeContact(method: ContactMethod, input: string): string {
  const value = input.trim();
  if (method === "email") {
    // Do not apply provider-specific aliases: plus tags and dots are meaningful.
    const normalized = value.toLowerCase();
    if (normalized.length > 320 || !isEmail(normalized)) throw new BadRequestException("Invalid email address");
    return normalized;
  }
  // A country is never inferred from locale, language, or event city.
  if (!value.startsWith("+")) throw new BadRequestException("Use an international phone number");
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed?.isValid()) throw new BadRequestException("Invalid phone number");
  return parsed.number;
}
