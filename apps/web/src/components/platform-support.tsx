"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  Paged,
  PrivateFile,
  SupportCase,
  SupportMessage,
} from "@event-platform/shared-types";
import { apiBlobRequest, apiRequest } from "../app/(auth)/_lib/api";
import { useLocale } from "./locale-provider";
import "./platform-support.css";
export function useSupportText() {
  const locale = useLocale();
  return (ru: string, kk: string, en: string) => ({ ru, kk, en })[locale];
}
export async function supportRequest<T>(
  path: string,
  init: RequestInit = {},
  access?: string,
): Promise<T> {
  if (!access) return apiRequest<T>(`/platform-support/${path}`, init);
  const response = await fetch(`/platform-support/${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      "x-quick-access": access,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? `Ошибка запроса (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export async function downloadSupportFile(file: PrivateFile, access?: string) {
  const path = `/platform-support/files/${file.id}`;
  let blob: Blob;
  if (access) {
    const response = await fetch(path, {
      headers: { "x-quick-access": access },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Ошибка загрузки (${response.status})`);
    blob = await response.blob();
  } else blob = await apiBlobRequest(path);
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function SupportFile({
  file,
  access,
  onError,
}: {
  file: PrivateFile;
  access?: string | undefined;
  onError: (v: string) => void;
}) {
  return (
    <button
      type="button"
      className="account-text-link"
      onClick={() =>
        void downloadSupportFile(file, access).catch((e) =>
          onError(String(e.message)),
        )
      }
    >
      {file.name} · {Math.ceil(file.size / 1024)} KB ↓
    </button>
  );
}
export function SupportStatus({ status }: { status: string }) {
  const t = useSupportText();
  const names: Record<string, string> = {
    new: t("Новое", "Жаңа", "New"),
    in_progress: t("В работе", "Қарастырылуда", "In progress"),
    closed: t("Закрыто", "Жабық", "Closed"),
    pending: t("На проверке", "Тексерілуде", "Pending review"),
    changes_requested: t(
      "Нужны изменения",
      "Өзгеріс қажет",
      "Changes requested",
    ),
    verified: t("Подтверждён", "Расталған", "Verified"),
    rejected: t("Отклонено", "Қабылданбаған", "Rejected"),
    revoked: t(
      "Подтверждение отозвано",
      "Растау қайтарылды",
      "Verification revoked",
    ),
    not_submitted: t("Не отправлена", "Жіберілмеген", "Not submitted"),
  };
  return <span className="support-status">{names[status] ?? status}</span>;
}
export function PlatformSupport({
  access,
  orderId,
  initialCaseId,
  onUnread,
}: {
  access?: string | undefined;
  orderId?: string | undefined;
  initialCaseId?: string | undefined;
  onUnread?: (v: number) => void;
}) {
  const t = useSupportText(),
    [cases, setCases] = useState<Paged<SupportCase> | null>(null),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(initialCaseId ?? null),
    [creating, setCreating] = useState(false),
    [subject, setSubject] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const refresh = useCallback(async () => {
    try {
      const result = await supportRequest<Paged<SupportCase>>(
        `cases?page=${page}`,
        {},
        access,
      );
      setCases(result);
      onUnread?.(result.items.filter((v) => v.unread).length);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page, access, onUnread]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const query = new URLSearchParams(location.search).get("caseId");
    if (initialCaseId) setSelected(initialCaseId);
    else if (query && /^[a-f0-9-]{36}$/i.test(query)) setSelected(query);
  }, [initialCaseId]);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await supportRequest<SupportCase>(
        "cases",
        {
          method: "POST",
          body: JSON.stringify({
            subject,
            text,
            clientKey: key.current,
            ...(orderId ? { orderId } : {}),
          }),
        },
        access,
      );
      setCreating(false);
      setSelected(row.id);
      setSubject("");
      setText("");
      key.current = crypto.randomUUID();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="platform-support">
      <div className="account-card-toolbar">
        <h2>{t("Поддержка TICKET", "TICKET қолдауы", "TICKET support")}</h2>
        <button
          type="button"
          className="account-button account-button-primary"
          onClick={() => {
            setCreating(true);
            setSelected(null);
            key.current = crypto.randomUUID();
          }}
        >
          {t("Новое обращение", "Жаңа өтініш", "New conversation")}
        </button>
      </div>
      {error ? (
        <p role="alert" className="support-error">
          {error}
          <button
            type="button"
            className="account-text-link"
            onClick={() => void refresh()}
          >
            {t("Повторить", "Қайталау", "Retry")}
          </button>
        </p>
      ) : null}
      {creating ? (
        <form
          className="account-card support-form"
          onSubmit={(e) => void create(e)}
        >
          <label className="account-field">
            {t("Тема", "Тақырып", "Subject")}
            <input
              required
              minLength={3}
              maxLength={160}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <label className="account-field">
            {t("Сообщение", "Хабарлама", "Message")}
            <textarea
              required
              maxLength={4000}
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="support-actions">
            <button
              disabled={busy}
              className="account-button account-button-primary"
            >
              {busy
                ? t("Отправка…", "Жіберілуде…", "Sending…")
                : t("Отправить", "Жіберу", "Send")}
            </button>
            <button
              type="button"
              className="account-button"
              onClick={() => setCreating(false)}
            >
              {t("Отмена", "Бас тарту", "Cancel")}
            </button>
          </div>
          <small>
            {t(
              "Вложения можно добавить после создания обращения.",
              "Өтініш жасалғаннан кейін файл қосуға болады.",
              "Attachments can be added after creating the conversation.",
            )}
          </small>
        </form>
      ) : null}
      {selected ? (
        <>
          <button
            type="button"
            className="account-text-link"
            onClick={() => {
              setSelected(null);
              void refresh();
            }}
          >
            ← {t("Все обращения", "Барлық өтініштер", "All conversations")}
          </button>
          <SupportConversation
            id={selected}
            access={access}
            onChanged={refresh}
          />
        </>
      ) : !creating ? (
        <div className="account-card">
          {cases ? (
            cases.items.length ? (
              cases.items.map((row) => (
                <button
                  className="support-case-row"
                  type="button"
                  key={row.id}
                  onClick={() => setSelected(row.id)}
                >
                  <span>
                    <strong>
                      {row.unread ? "● " : ""}
                      {row.subject}
                    </strong>
                    <small>{new Date(row.updatedAt).toLocaleString()}</small>
                  </span>
                  <SupportStatus status={row.status} />
                </button>
              ))
            ) : (
              <p className="support-empty">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M7 9h10M7 13h6"/></svg>
                {t(
                  "Обращений пока нет. Напишите нам — мы поможем.",
                  "Әзірге өтініш жоқ. Бізге жазыңыз — көмектесеміз.",
                  "No conversations yet. Write to us for help.",
                )}
              </p>
            )
          ) : (
            <p role="status">{t("Загрузка…", "Жүктелуде…", "Loading…")}</p>
          )}
          {cases && cases.total > cases.limit ? (
            <div className="support-actions">
              <button
                type="button"
                className="account-button"
                disabled={page === 1}
                onClick={() => setPage((v) => v - 1)}
              >
                ←
              </button>
              <span>{page}</span>
              <button
                type="button"
                className="account-button"
                disabled={!cases.hasNext}
                onClick={() => setPage((v) => v + 1)}
              >
                →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
export function SupportConversation({
  id,
  access,
  onChanged,
}: {
  id: string;
  access?: string | undefined;
  onChanged?: () => void;
}) {
  const t = useSupportText(),
    [messages, setMessages] = useState<
      (Paged<SupportMessage> & { case: SupportCase }) | null
    >(null),
    [page, setPage] = useState(1),
    [text, setText] = useState(""),
    [files, setFiles] = useState<PrivateFile[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setMessages(
        await supportRequest(`cases/${id}/messages?page=${page}`, {}, access),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, access, page]);
  useEffect(() => {
    setPage(1);
    setMessages(null);
    setFiles([]);
    setText("");
    key.current = crypto.randomUUID();
  }, [id]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function upload(selected: FileList | null) {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (files.length + selected.length > 5)
        throw new Error(
          t("Максимум 5 файлов", "Ең көбі 5 файл", "Maximum 5 files"),
        );
      for (const file of Array.from(selected)) {
        const data = new FormData();
        data.set("file", file);
        const row = await supportRequest<PrivateFile>(
          `uploads?caseId=${id}`,
          { method: "POST", body: data },
          access,
        );
        setFiles((values) => [...values, row]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await supportRequest(
        `cases/${id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            text,
            clientKey: key.current,
            fileIds: files.map((v) => v.id),
          }),
        },
        access,
      );
      setText("");
      setFiles([]);
      key.current = crypto.randomUUID();
      setPage(1);
      await refresh();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const sender = (kind: string) =>
    kind === "moderator"
      ? t("Модератор", "Модератор", "Moderator")
      : kind === "support"
        ? t("Поддержка", "Қолдау", "Support")
        : kind === "organizer"
          ? t("Организатор", "Ұйымдастырушы", "Organizer")
          : t("Покупатель", "Сатып алушы", "Customer");
  return (
    <section className="account-card support-thread">
      <div className="account-card-toolbar">
        <h3>
          {messages?.case.subject ?? t("Переписка", "Хаттар", "Conversation")}
        </h3>
        {messages ? <SupportStatus status={messages.case.status} /> : null}
      </div>
      {error ? (
        <p role="alert" className="support-error">
          {error}
        </p>
      ) : null}
      {messages ? (
        <>
          <div className="support-actions">
            <button
              type="button"
              className="account-button"
              disabled={!messages.hasNext}
              onClick={() => setPage((v) => v + 1)}
            >
              {t("Ранее", "Ертерек", "Older")}
            </button>
            <span>{page}</span>
            <button
              type="button"
              className="account-button"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              {t("Новее", "Жаңарақ", "Newer")}
            </button>
          </div>
          <div className="support-message-list" aria-live="polite">
            {messages.items.map((row) => (
              <article
                className={`support-message ${["moderator", "support"].includes(row.authorKind) ? "from-staff" : ""}`}
                key={row.id}
              >
                <div>
                  <strong>{sender(row.authorKind)}</strong>
                  <time dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleString()}
                  </time>
                </div>
                <p>{row.text}</p>
                {row.files.map((file) => (
                  <SupportFile
                    key={file.id}
                    file={file}
                    access={access}
                    onError={setError}
                  />
                ))}
              </article>
            ))}
          </div>
        </>
      ) : (
        <p role="status">{t("Загрузка…", "Жүктелуде…", "Loading…")}</p>
      )}
      <form className="support-form" onSubmit={(e) => void send(e)}>
        <label className="account-field">
          {t("Сообщение", "Хабарлама", "Message")}
          <textarea
            required
            rows={3}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="account-field">
          {t(
            "Вложения · PDF, JPEG, PNG · до 10 МБ · до 5 файлов",
            "Файлдар · PDF, JPEG, PNG · 10 МБ дейін · 5 файл",
            "Attachments · PDF, JPEG, PNG · up to 10 MB · 5 files",
          )}
          <input
            disabled={busy}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.map((file) => (
          <div key={file.id}>
            {file.name}
            <button
              type="button"
              className="account-text-link"
              onClick={() =>
                setFiles((rows) => rows.filter((v) => v.id !== file.id))
              }
            >
              {" "}
              ×
            </button>
          </div>
        ))}
        <button
          disabled={busy}
          className="account-button account-button-primary"
        >
          {busy
            ? t("Отправка…", "Жіберілуде…", "Sending…")
            : t("Отправить", "Жіберу", "Send")}
        </button>
      </form>
    </section>
  );
}
