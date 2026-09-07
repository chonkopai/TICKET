export type UserRole = "guest" | "organizer" | "admin";

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
  telegramId: string;
  telegramChatId: string | null;
  role: UserRole;
  name: string | null;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
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
