import { z } from "zod";
export const quickIdSchema = z.uuid();

export const quickStartSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const quickTicketSchema = z.object({ ticketTypeId: z.uuid(), quantity: z.number().int().min(1).max(10), termsAccepted: z.literal(true) }).strict();
export const quickTableSchema = z.object({ tableId: z.uuid(), termsAccepted: z.literal(true) }).strict();
export const quickClaimSchema = z.object({ claimToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const quickVerifySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), telegramId: z.string().regex(/^[1-9][0-9]{0,15}$/), chatId: z.string().regex(/^[1-9][0-9]{0,15}$/), messageId: z.number().int().positive() }).strict();
export const quickRu = {
  title: "Покупка без регистрации", name: "Ваше имя", start: "Продолжить через Telegram", verify: "Подтвердить Telegram",
  check: "Я подтвердил — проверить", verified: "Telegram подтверждён", checkout: "Перейти к оплате", accept: "Принимаю условия отмены и депозита",
  error: "Не удалось выполнить действие. Проверьте данные и попробуйте снова.", saved: "Покупка сохранена в личном кабинете",
  claim: "Сохранить покупку в моём аккаунте", login: "Войти через Telegram и сохранить покупку", refresh: "Обновить статус",
  qr: "Открыть QR-код", wallet: "Добавить в Apple Wallet", payment: "Оплата", full: "Полная оплата", deposit: "Депозит",
  waiting: "Откройте бота и подтвердите получение билетов. Аккаунт на сайте не создаётся.", return: "После оплаты вернитесь на эту страницу.",
  unavailable: "Покупка недоступна. Откройте её в том браузере, где оформляли заказ.", quick: "Купить без регистрации", purchases: "Покупки",
  quantity: "Количество", seats: "мест", recipientPending: "Подтверждение ещё не получено. Нажмите Start в боте, затем проверьте снова.",
  informationalFull: "Полная стоимость (справочно)",
  botPending: "Подтверждаем получение покупки. После оплаты здесь появится ваш билет или бронь.",
  botVerified: "Telegram подтверждён. Вернитесь на сайт для оплаты — регистрация не требуется.",
  ticketStatuses: { created: "Создан", pending_payment: "Ожидает оплаты", paid: "Оплачен", active: "Активен", used: "Использован", cancelled: "Отменён", refunded: "Возвращён" },
};
export interface QuickSession { sessionToken: string; accessToken: string; telegramUrl: string; expiresAt: string; accessExpiresAt: string }
export interface QuickOrderStatus {
  orderId: string; status: string; title: string; paymentMode: "deposit" | "full_payment"; amountDue: number; fullAmount: number | null;
  currency: string; cancellationTerms: string | null; depositTerms: string | null; expiresAt: string | null; linked: boolean;
  tickets: Array<{ id: string; name: string; status: string }>;
  booking: { id: string; status: string; table: { number: number; name: string | null } } | null;
  deposit: { amount: number; status: string } | null;
}
