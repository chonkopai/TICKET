import type { User } from "@event-platform/database";
import type { AuthUser } from "@event-platform/shared-types";

export function presentUser(user: User): AuthUser {
  return {
    id: user.id,
    organizerVerified: !!user.organizerVerifiedAt && !user.blockedAt,
    restricted: !!user.blockedAt,
    telegramId: user.telegramId?.toString() ?? null,
    telegramChatId: user.telegramChatId?.toString() ?? null,
    role: user.role,
    name: user.name,
    photoUrl: user.photoUrl,
    phone: user.phone,
    email: user.email,
    defaultCity: user.defaultCity,
    defaultCountry: user.defaultCountry ?? null,
    preferredCurrency: user.preferredCurrency === "KZT" || user.preferredCurrency === "RUB" || user.preferredCurrency === "USD" ? user.preferredCurrency : null,
  };
}
