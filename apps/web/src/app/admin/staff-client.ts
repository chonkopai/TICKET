let csrf = "";
export function setStaffCsrf(value: string) {
  csrf = value;
}
export class StaffApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export async function staffRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`/staff-api/${path}`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(body !== undefined && !(body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...(method !== "GET" ? { "x-staff-csrf": csrf } : {}),
    },
    ...(body !== undefined
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ code: "STAFF_BACKEND_UNAVAILABLE" }));
  if (
    response.status === 401 &&
    typeof window !== "undefined" &&
    !location.pathname.endsWith("/login")
  )
    location.replace("/admin/login");
  if (!response.ok)
    throw new StaffApiError(
      data.code ?? data.message ?? "REQUEST_FAILED",
      response.status,
    );
  return data as T;
}
export function errorText(error: unknown, locale = "ru") {
  const code = error instanceof Error ? error.message : "REQUEST_FAILED";
  const known: Record<string, string> = {
    STAFF_AUTH_INVALID: "Неверные данные или код. Войдите заново.",
    CSRF_INVALID: "Сессия изменилась. Обновите страницу.",
    STAFF_RATE_LIMITED: "Слишком много попыток. Повторите позже.",
    STAFF_EMAIL_UNAVAILABLE: "Отправка email пока не настроена.",
    STAFF_EMAIL_SEND_FAILED: "Не удалось отправить email.",
    STAFF_UNAVAILABLE: "Администрирование пока не настроено.",
    STAFF_BACKEND_UNAVAILABLE: "Сервер недоступен. Повторите попытку.",
    MODERATOR_REQUIRED: "Это действие доступно модератору.",
    LAST_MODERATOR: "Нельзя отключить последнего модератора.",
    REFUND_POLICY_REQUIRES_MODERATOR_OVERRIDE:
      "Для исключения из правил возврата требуется модератор.",
    REFUND_PROVIDER_UNSUPPORTED:
      "Текущий платёжный адаптер не поддерживает этот возврат.",
    REFUND_IN_PROGRESS: "Возврат уже обрабатывается.",
    PARTIAL_REFUND_UNSUPPORTED_FOR_BUNDLE:
      "Для этого типа покупки доступен возврат целиком.",
    TICKET_EMAIL_UNAVAILABLE: "Email-доставка пока не настроена.",
    TICKET_EMAIL_RESEND_LIMIT: "Повторная отправка пока недоступна.",
    TICKET_RESEND_LIMIT: "Билет недавно отправлялся. Повторите позже.",
    PAID_ORDER_REQUIRES_REFUND: "Для оплаченного заказа используйте возврат.",
    VERIFICATION_PENDING: "Заявка уже ожидает проверки.",
    INVALID_REQUEST: "Проверьте заполненные поля.",
    STAFF_EXISTS: "Сотрудник с этим email уже зарегистрирован.",
    FILE_TYPE_INVALID: "Загрузите PDF, JPEG или PNG.",
    FILE_SIZE_INVALID: "Размер файла должен быть до 10 МБ.",
  };
  return locale === "ru"
    ? (known[code] ??
        "Не удалось выполнить действие. Проверьте данные и повторите попытку.")
    : locale === "kk"
      ? "Әрекет орындалмады. Деректерді тексеріп, қайталаңыз."
      : "Could not complete this action. Check the details and try again.";
}
