import type { UserRole } from "@event-platform/shared-types";

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");
export const ROLES_KEY = "auth:roles";

export interface AuthConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  telegramBotToken: string;
  telegramBotUsername: string;
  botApiSecret: string;
  organizerRequiresApproval: boolean;
}

export interface AuthenticatedPrincipal {
  userId: string;
  role: UserRole;
}

export interface BotPrincipal extends AuthenticatedPrincipal {
  telegramId: string;
  chatId: string;
}
