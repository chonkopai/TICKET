export type UserRole = "guest" | "organizer" | "admin";
export type LoginContactMethod = "email" | "phone";

export interface VerificationRequestResponse {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
}

export interface VerificationGrantResponse {
  grant: string;
  expiresAt: string;
}

export interface LinkedMethodsResponse {
  google?: { linked: boolean; email: string | null };
  telegram: { linked: boolean; id: string | null };
  email: { linked: boolean; address: string | null; verifiedAt: string | null };
  phone: { linked: boolean; number: string | null; verifiedAt: string | null };
  passwordSet: boolean;
}

export interface TelegramLoginPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AuthUser {
  id: string;
  telegramId: string | null;
  telegramChatId: string | null;
  role: UserRole;
  name: string | null;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  defaultCity: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshResponse {
  tokens: AuthTokens;
}

export interface TelegramLinkTokenResponse {
  token: string;
  deepLinkUrl: string;
  expiresAt: string;
}

export interface TelegramLinkConsumeRequest {
  token: string;
  telegramId: number;
  chatId: number;
  firstName?: string;
  lastName?: string;
}
