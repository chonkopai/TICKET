"use client";
import { INTL_LOCALES, localeFromBrowser } from "../../lib/locale";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { useLocale } from "../../components/locale-provider";
import { errorText, staffRequest } from "./staff-client";
export function useText() {
  const locale = useLocale();
  return (ru: string, kk: string, en: string) =>
    locale === "ru" ? ru : locale === "kk" ? kk : en;
}
export type Row = Record<string, unknown>;
export const obj = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
export const list = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(obj) : [];
export const text = (value: unknown) =>
  value === null || value === undefined ? "—" : String(value);
export function money(amount: unknown, currency: unknown) {
  return typeof amount === "number"
    ? new Intl.NumberFormat(INTL_LOCALES[localeFromBrowser()], {
        style: "currency",
        currency: String(currency ?? "KZT"),
      }).format(amount / 100)
    : "—";
}
export function date(value: unknown) {
  return value
    ? new Intl.DateTimeFormat(INTL_LOCALES[localeFromBrowser()], {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(String(value)))
    : "—";
}
export function useResource<T>(path: string | null, interval = 0) {
  const locale = useLocale(),
    [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let active = true;
    setData(null);
    setError("");
    const load = async () => {
      try {
        const value = await staffRequest<T>(path);
        if (active) {
          setData(value);
          setError("");
        }
      } catch (reason) {
        if (active) setError(errorText(reason, locale));
      }
    };
    void load();
    const timer = interval
      ? setInterval(() => {
          if (document.visibilityState === "visible") void load();
        }, interval)
      : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [path, revision, locale, interval]);
  return { data, error, retry: () => setRevision((n) => n + 1), setData };
}
export function Status({ value }: { value: unknown }) {
  const t = useText(),
    labels: Record<string, string> = {
      not_requested: t("Не запрошена", "Сұралмаған", "Not requested"),
      accepted: t(
        "Принято провайдером",
        "Провайдер қабылдады",
        "Accepted by provider",
      ),
      uncertain: t(
        "Результат не подтверждён",
        "Нәтиже расталмады",
        "Outcome unconfirmed",
      ),
      dispatching: t(
        "Отправка проверяется",
        "Жіберу тексерілуде",
        "Dispatch outcome pending",
      ),
      new: t("Новые", "Жаңа", "New"),
      in_progress: t("В работе", "Жұмыста", "In progress"),
      closed: t("Закрыто", "Жабық", "Closed"),
      pending: t("Ожидает", "Күтуде", "Pending"),
      verified: t("Проверен", "Расталған", "Verified"),
      changes_requested: t(
        "Нужны изменения",
        "Өзгеріс қажет",
        "Changes requested",
      ),
      rejected: t("Отклонено", "Қабылданбады", "Rejected"),
      revoked: t(
        "Проверка отозвана",
        "Растау қайтарылды",
        "Verification revoked",
      ),
      paid: t("Оплачено", "Төленді", "Paid"),
      refunded: t("Возвращено", "Қайтарылды", "Refunded"),
      active: t("Действует", "Белсенді", "Active"),
      used: t("Использован", "Қолданылған", "Used"),
      cancelled: t("Отменён", "Болдырылмады", "Cancelled"),
      processing: t("Обрабатывается", "Өңделуде", "Processing"),
      succeeded: t("Выполнено", "Орындалды", "Succeeded"),
      requested: t("Запрошено", "Сұралды", "Requested"),
      failed: t("Ошибка", "Қате", "Failed"),
      queued: t("В очереди", "Кезекте", "Queued"),
      clear: t("Доступно", "Қолжетімді", "Available"),
      approved: t("Одобрено", "Мақұлданды", "Approved"),
      hidden: t("Скрыто", "Жасырылған", "Hidden"),
      sales_paused: t("Продажи остановлены", "Сату тоқтатылды", "Sales paused"),
      published: t("Опубликовано", "Жарияланған", "Published"),
      draft: t("Черновик", "Нобай", "Draft"),
      support: t("Поддержка", "Қолдау", "Support"),
      moderator: t("Модератор", "Модератор", "Moderator"),
      customer: t("Покупатель", "Сатып алушы", "Customer"),
      organizer: t("Организатор", "Ұйымдастырушы", "Organizer"),
    };
  return (
    <span className="staff-status">{labels[String(value)] ?? text(value)}</span>
  );
}
export function Table({
  columns,
  rows,
  onRow,
}: {
  columns: { key: string; label: string; render?: (row: Row) => ReactNode }[];
  rows: Row[];
  onRow?: (row: Row) => void;
}) {
  const t = useText();
  return rows.length ? (
    <div className="staff-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((c, i) => (
                <td key={c.key}>
                  {i === 0 && onRow ? (
                    <button className="staff-link" onClick={() => onRow(row)}>
                      {c.render ? c.render(row) : text(row[c.key])}
                    </button>
                  ) : c.render ? (
                    c.render(row)
                  ) : (
                    text(row[c.key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="staff-muted">
      {t("Записей пока нет", "Әзірге жазба жоқ", "No records yet")}
    </p>
  );
}
export function ResourceState({
  error,
  loading,
  onRetry,
}: {
  error: string;
  loading: boolean;
  onRetry: () => void;
}) {
  const t = useText();
  return error ? (
    <div role="alert" className="staff-error">
      {error}
      <button onClick={onRetry}>{t("Повторить", "Қайталау", "Retry")}</button>
    </div>
  ) : loading ? (
    <p role="status">{t("Загрузка…", "Жүктелуде…", "Loading…")}</p>
  ) : null;
}
export function Pager({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (n: number) => void;
}) {
  const t = useText();
  return total > limit ? (
    <nav className="staff-pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("Назад", "Артқа", "Previous")}
      </button>
      <span>
        {page} / {Math.max(1, Math.ceil(total / limit))}
      </span>
      <button disabled={page * limit >= total} onClick={() => onPage(page + 1)}>
        {t("Далее", "Келесі", "Next")}
      </button>
    </nav>
  ) : null;
}
export function ActionDialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const t = useText(),
    locale = useLocale(),
    ref = useRef<HTMLDialogElement>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(reason);
      onClose();
    } catch (value) {
      setError(errorText(value, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="staff-dialog"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2>{title}</h2>
        {children}
        <label>
          {t(
            "Причина / комментарий",
            "Себеп / түсініктеме",
            "Reason / comment",
          )}
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
          />
        </label>
        {error ? (
          <p role="alert" className="staff-error">
            {error}
          </p>
        ) : null}
        <div className="staff-actions">
          <button disabled={busy} type="button" onClick={onClose}>
            {t("Отмена", "Бас тарту", "Cancel")}
          </button>
          <button className="staff-primary" disabled={busy || disabled}>
            {busy
              ? "…"
              : (submitLabel ?? t("Подтвердить", "Растау", "Confirm"))}
          </button>
        </div>
      </form>
    </dialog>
  );
}
