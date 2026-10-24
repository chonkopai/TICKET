"use client";
import { StaffSelect } from "./staff-select";
import { useEffect, useRef, useState } from "react";
import type {
  Paged,
  SupportCase,
  SupportMessage,
  StaffUser,
  PrivateFile,
} from "@event-platform/shared-types";
import { useLocale } from "../../components/locale-provider";
import { staffRequest, errorText } from "./staff-client";
import {
  useText,
  useResource,
  ResourceState,
  Table,
  Pager,
  Status,
  ActionDialog,
  date,
  money,
  text,
  type Row,
} from "./staff-ui";
export function StaffSupportInbox({
  staff,
  initialCaseId,
  onConsumed,
  openOrder,
}: {
  staff: StaffUser;
  initialCaseId: string | null;
  onConsumed: () => void;
  openOrder: (id: string) => void;
}) {
  const t = useText(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [assigned, setAssigned] = useState(false),
    [page, setPage] = useState(1),
    [id, setId] = useState<string | null>(null);
  const resource = useResource<Paged<SupportCase>>(
    `cases?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}${assigned ? `&assigned=${staff.id}` : ""}`,
    10000,
  );
  useEffect(() => {
    if (initialCaseId) {
      setId(initialCaseId);
      onConsumed();
    }
  }, [initialCaseId, onConsumed]);
  if (id)
    return (
      <StaffConversation
        id={id}
        staff={staff}
        openOrder={openOrder}
        onBack={() => {
          setId(null);
          resource.retry();
        }}
      />
    );
  return (
    <section className="staff-card">
      <div className="staff-toolbar">
        <input
          type="search"
          aria-label={t(
            "Поиск обращений",
            "Өтініш іздеу",
            "Search conversations",
          )}
          placeholder={t(
            "Поиск обращений",
            "Өтініш іздеу",
            "Search conversations",
          )}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <StaffSelect
          aria-label={t("Статус", "Күйі", "Status")}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {t("Все статусы", "Барлық күйлер", "All statuses")}
          </option>
          <option value="new">{t("Новые", "Жаңа", "New")}</option>
          <option value="in_progress">
            {t("В работе", "Жұмыста", "In progress")}
          </option>
          <option value="closed">{t("Закрытые", "Жабық", "Closed")}</option>
        </StaffSelect>
        <label className="staff-inline">
          <input
            type="checkbox"
            checked={assigned}
            onChange={(e) => {
              setAssigned(e.target.checked);
              setPage(1);
            }}
          />
          {t("Назначены мне", "Маған тағайындалған", "Assigned to me")}
        </label>
      </div>
      <p className="staff-result-count">
        {t("Обращений", "Өтініштер", "Conversations")}:{" "}
        {resource.data?.total ?? "…"}
      </p>
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {resource.data ? (
        <>
          <Table
            rows={resource.data.items as unknown as Row[]}
            columns={[
              {
                key: "subject",
                label: t("Тема", "Тақырып", "Subject"),
                render: (row) => (
                  <>
                    {row.unread ? (
                      <strong
                        aria-label={t("Непрочитано", "Оқылмаған", "Unread")}
                      >
                        ●{" "}
                      </strong>
                    ) : null}
                    {text(row.subject)}
                  </>
                ),
              },
              {
                key: "status",
                label: t("Статус", "Күйі", "Status"),
                render: (row) => <Status value={row.status} />,
              },
              {
                key: "updatedAt",
                label: t("Обновлено", "Жаңартылды", "Updated"),
                render: (row) => date(row.updatedAt),
              },
            ]}
            onRow={(row) => setId(String(row.id))}
          />
          <Pager
            page={page}
            limit={20}
            total={resource.data.total}
            onPage={setPage}
          />
        </>
      ) : null}
    </section>
  );
}
function StaffConversation({
  id,
  staff,
  onBack,
  openOrder,
}: {
  id: string;
  staff: StaffUser;
  onBack: () => void;
  openOrder: (id: string) => void;
}) {
  const t = useText(),
    locale = useLocale(),
    resource = useResource<Paged<SupportMessage> & { case: SupportCase }>(
      `cases/${id}/messages?limit=50`,
      5000,
    ),
    [body, setBody] = useState(""),
    [internal, setInternal] = useState(false),
    [files, setFiles] = useState<PrivateFile[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [change, setChange] = useState(false),
    [status, setStatus] = useState("in_progress"),
    [context, setContext] = useState(""),
    [eventContext, setEventContext] = useState(""),
    [ticketContext, setTicketContext] = useState(""),
    [chat, setChat] = useState<Paged<Row> | null>(null),
    [messagePage, setMessagePage] = useState(1);
  const key = useRef(crypto.randomUUID()),
    older = useResource<Paged<SupportMessage>>(
      messagePage > 1
        ? `cases/${id}/messages?page=${messagePage}&limit=50`
        : null,
    );
  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await staffRequest(`cases/${id}/messages`, {
        text: body,
        internal,
        clientKey: key.current,
        fileIds: files.map((f) => f.id),
      });
      key.current = crypto.randomUUID();
      setBody("");
      setFiles([]);
      resource.retry();
    } catch (reason) {
      setError(errorText(reason, locale));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await staffRequest<PrivateFile>(
        `cases/${id}/uploads`,
        data,
      );
      setFiles((value) => [...value, result]);
    } catch (reason) {
      setError(errorText(reason, locale));
    } finally {
      setBusy(false);
    }
  }
  const order = useResource<Row>(
    resource.data?.case.orderId ? `orders/${resource.data.case.orderId}` : null,
  );
  const conversation = resource.data?.case,
    messages = messagePage > 1 ? older.data?.items : resource.data?.items;
  return (
    <>
      <button className="staff-link" onClick={onBack}>
        ← {t("Все обращения", "Барлық өтініштер", "All conversations")}
      </button>
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {conversation ? (
        <div className="staff-conversation-layout">
          <section className="staff-card">
            <div className="staff-toolbar">
              <h2>{conversation.subject}</h2>
              <Status value={conversation.status} />
            </div>
            <div className="staff-messages" aria-live="polite">
              {messages?.map((message) => (
                <article
                  key={message.id}
                  className={`staff-message ${message.internal ? "is-note" : ""}`}
                >
                  <div>
                    <Status value={message.authorKind} />
                    {message.internal ? (
                      <strong>
                        {t("Внутренняя заметка", "Ішкі жазба", "Internal note")}
                      </strong>
                    ) : null}
                    <time>{date(message.createdAt)}</time>
                  </div>
                  <p>{message.text}</p>
                  {message.files.map((file) => (
                    <a
                      key={file.id}
                      href={`/staff-api/files/${file.id}`}
                      download
                    >
                      {file.name}
                    </a>
                  ))}
                </article>
              ))}
            </div>
            <Pager
              page={messagePage}
              limit={50}
              total={resource.data?.total ?? 0}
              onPage={setMessagePage}
            />
            {error ? (
              <p className="staff-error" role="alert">
                {error}
              </p>
            ) : null}
            <label>
              {t("Сообщение", "Хабарлама", "Message")}
              <textarea
                value={body}
                maxLength={4000}
                rows={4}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <label className="staff-inline">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
              />
              {t(
                "Внутренняя заметка — видна только сотрудникам",
                "Ішкі жазба — тек қызметкерлерге көрінеді",
                "Internal note — staff only",
              )}
            </label>
            <div className="staff-actions">
              <label className="staff-upload">
                {t("Прикрепить файл", "Файл тіркеу", "Attach file")}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={busy || files.length >= 5}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              <button
                className="staff-primary"
                disabled={busy || !body.trim()}
                onClick={() => void send()}
              >
                {t("Отправить", "Жіберу", "Send")}
              </button>
            </div>
            {files.map((file) => (
              <span key={file.id} className="staff-status">
                {file.name}
                <button
                  onClick={() =>
                    setFiles((items) => items.filter((f) => f.id !== file.id))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </section>
          <aside className="staff-card">
            <h2>{t("Обращение", "Өтініш", "Case")}</h2>
            <p className="staff-id">{id}</p>
            <p>
              {t("Заказ", "Тапсырыс", "Order")}:{" "}
              <span className="staff-id">{conversation.orderId ?? "—"}</span>
            </p>
            {order.data ? (
              <div>
                <p>
                  {t("Сумма", "Сома", "Amount")}:{" "}
                  {money(order.data.amount, order.data.currency)}
                </p>
                <Status value={order.data.paymentStatus} />
                <button onClick={() => openOrder(conversation.orderId!)}>
                  {t(
                    "Заказ, билеты и возврат",
                    "Тапсырыс, билеттер және қайтару",
                    "Order, tickets & refund",
                  )}
                </button>
              </div>
            ) : null}
            <button
              onClick={() => {
                setStatus(conversation.status);
                setContext(conversation.orderId ?? "");
                setEventContext(conversation.eventId ?? "");
                setTicketContext(conversation.ticketId ?? "");
                setChange(true);
              }}
            >
              {t(
                "Статус и контекст",
                "Күйі және деректері",
                "Status & context",
              )}
            </button>
            <button
              onClick={() =>
                void staffRequest(
                  `cases/${id}`,
                  { assignedStaffId: staff.id, reason: "Assigned to myself" },
                  "PATCH",
                )
                  .then(resource.retry)
                  .catch((reason) => setError(errorText(reason, locale)))
              }
            >
              {t("Назначить себе", "Өзіме тағайындау", "Assign to me")}
            </button>
            {conversation.orderId ? (
              <button
                onClick={() =>
                  void staffRequest<Paged<Row>>(`cases/${id}/order-chat`)
                    .then(setChat)
                    .catch((reason) => setError(errorText(reason, locale)))
                }
              >
                {t(
                  "Переписка по заказу",
                  "Тапсырыс хаттары",
                  "Inspect order conversation",
                )}
              </button>
            ) : null}
            {chat ? (
              <div>
                {chat.items.map((row) => (
                  <p key={String(row.id)}>
                    <strong>{text(row.sender)}</strong>: {text(row.text)}
                  </p>
                ))}
                <Pager
                  page={chat.page}
                  total={chat.total}
                  limit={chat.limit}
                  onPage={(page) => {
                    void staffRequest<Paged<Row>>(
                      `cases/${id}/order-chat?page=${page}`,
                    )
                      .then(setChat)
                      .catch((reason) => setError(errorText(reason, locale)));
                  }}
                />
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
      {change ? (
        <ActionDialog
          title={t("Обновить обращение", "Өтінішті жаңарту", "Update case")}
          onClose={() => setChange(false)}
          onSubmit={async (reason) => {
            await staffRequest(
              `cases/${id}`,
              {
                status,
                reason,
                orderId: context.trim() || null,
                eventId: eventContext.trim() || null,
                ticketId: ticketContext.trim() || null,
              },
              "PATCH",
            );
            resource.retry();
          }}
        >
          <label>
            {t("Статус", "Күйі", "Status")}
            <StaffSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="new">{t("Новое", "Жаңа", "New")}</option>
              <option value="in_progress">
                {t("В работе", "Жұмыста", "In progress")}
              </option>
              <option value="closed">{t("Закрыто", "Жабық", "Closed")}</option>
            </StaffSelect>
          </label>
          <label>
            {t("Привязать заказ по ID", "Тапсырыс ID қосу", "Link order ID")}
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </label>
          <label>
            {t("Мероприятие ID", "Іс-шара ID", "Event ID")}
            <input
              value={eventContext}
              onChange={(e) => setEventContext(e.target.value)}
            />
          </label>
          <label>
            {t("Билет ID", "Билет ID", "Ticket ID")}
            <input
              value={ticketContext}
              onChange={(e) => setTicketContext(e.target.value)}
            />
          </label>
        </ActionDialog>
      ) : null}
    </>
  );
}
