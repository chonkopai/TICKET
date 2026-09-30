import { hash, verify } from "@node-rs/argon2";
import { BadRequestException } from "@nestjs/common";

const options = { algorithm: 2 as const, memoryCost: 65_536, timeCost: 3, parallelism: 1 }; // Argon2id
const dummyHash = hash("an-unknown-account-dummy-password", options);

export function validateNewPassword(password: string): void {
  // Preserve whitespace and Unicode exactly as entered; never truncate or trim.
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 1_024) {
    throw new BadRequestException({ code: "PASSWORD_LENGTH", minCharacters: 12, maxBytes: 1_024 });
  }
}

export async function hashPassword(password: string): Promise<string> {
  validateNewPassword(password);
  return hash(password, options);
}

export async function checkPassword(password: string, storedHash: string | null): Promise<boolean> {
  // Unknown identities pay the same Argon2 cost as a known account.
  const candidate = storedHash ?? await dummyHash;
  try { return await verify(candidate, password); }
  catch { return false; }
}
