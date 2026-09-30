export const VERIFICATION_CONFIG = Symbol("VERIFICATION_CONFIG");
export const VERIFICATION_SENDER = Symbol("VERIFICATION_SENDER");

export interface VerificationConfig {
  hmacSecret: string;
}
