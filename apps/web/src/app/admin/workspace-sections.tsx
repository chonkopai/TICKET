"use client";
import { StaffSelect } from "./staff-select";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  StaffUser,
  VerificationView,
  Paged,
} from "@event-platform/shared-types";
import { useLocale } from "../../components/locale-provider";
import { VerifiedOrganizerBadge } from "../../components/verified-organizer-badge";
import { staffRequest, errorText } from "./staff-client";
import {
  useText,
  useResource,
  ResourceState,
  Table,
  Pager,
  Status,
  ActionDialog,
  money,
  date,
  text,
  obj,
  list,
  type Row,
} from "./staff-ui";
function Search({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useText();
  return (
    <input
      type="search"
      aria-label={t("Поиск", "Іздеу", "Search")}
      placeholder={t(
        "Имя, email, телефон или номер",
        "Аты, email, телефон не нөмірі",
        "Name, email, phone, or number",
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function Back({ onClick }: { onClick: () => void }) {
  const t = useText();
  return (
    <button className="staff-link" onClick={onClick}>
      ← {t("Вернуться к списку", "Тізімге оралу", "Back to list")}
    </button>
  );
}
function Info({ pairs }: { pairs: [string, ReactNode][] }) {
  return (
    <dl className="staff-info">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function StaffPeople({
  staff,
  openCase,
}: {
  staff: StaffUser;
  openCase: (id: string) => void;
}) {
  const t = useText(),
    [tab, setTab] = useState("customers"),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [id, setId] = useState<string | null>(null);
  const pending = useResource<Row[]>(
    staff.role === "moderator" && tab === "organizers" ? "verifications" : null,
  );
  const resource = useResource<Paged<Row>>(
    `users?tab=${tab}&page=${page}&search=${encodeURIComponent(q)}`,
  );
  if (id)
    return (
      <PersonDetails
        id={id}
        staff={staff}
        openCase={openCase}
        onBack={() => {
          setId(null);
          resource.retry();
        }}
      />
    );
  return (
    <section className="staff-card">
      {pending.data?.length ? (
        <div>
          <h2>
            {t("Ожидают проверки", "Тексеруді күтуде", "Pending verification")}{" "}
            · {pending.data.length}
          </h2>
          <Table
            rows={pending.data}
            columns={[
              {
                key: "legalName",
                label: t("Организатор", "Ұйымдастырушы", "Organizer"),
              },
              {
                key: "createdAt",
                label: t("Подано", "Жіберілді", "Submitted"),
                render: (row) => date(row.createdAt),
              },
            ]}
            onRow={(row) => setId(String(row.organizerId))}
          />
        </div>
      ) : null}
      <div className="staff-toolbar">
        <div className="staff-tabs">
          <button
            aria-pressed={tab === "customers"}
            onClick={() => {
              setTab("customers");
              setPage(1);
            }}
          >
            {t("Покупатели", "Сатып алушылар", "Customers")}
          </button>
          <button
            aria-pressed={tab === "organizers"}
            onClick={() => {
              setTab("organizers");
              setPage(1);
            }}
          >
            {t("Организаторы", "Ұйымдастырушылар", "Organizers")}
          </button>
        </div>
        <Search
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
      </div>
      <p className="staff-result-count">
        {t("Всего", "Барлығы", "Total")}: {resource.data?.total ?? "…"}
      </p>
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {resource.data ? (
        <>
          <Table
            rows={resource.data.items}
            columns={[
              {
                key: "name",
                label: t("Имя", "Аты", "Name"),
                render: (row) => (
                  <>
                    {text(row.name)}
                    <VerifiedOrganizerBadge
                      verified={!!row.organizerVerifiedAt && !row.blockedAt}
                    />
                  </>
                ),
              },
              { key: "email", label: "Email" },
              { key: "phone", label: t("Телефон", "Телефон", "Phone") },
              {
                key: "createdAt",
                label: t("Регистрация", "Тіркелді", "Registered"),
                render: (row) => date(row.createdAt),
              },
              {
                key: "blockedAt",
                label: t("Доступ", "Қолжетімділік", "Access"),
                render: (row) =>
                  row.blockedAt
                    ? t("Заблокирован", "Бұғатталған", "Blocked")
                    : t("Активен", "Белсенді", "Active"),
              },
            ]}
            onRow={(row) => setId(String(row.id))}
          />
          <Pager
            page={page}
            total={resource.data.total}
            limit={20}
            onPage={setPage}
          />
        </>
      ) : null}
    </section>
  );
}
function PersonDetails({
  id,
  staff,
  openCase,
  onBack,
}: {
  id: string;
  staff: StaffUser;
  openCase: (id: string) => void;
  onBack: () => void;
}) {
  const t = useText(),
    resource = useResource<Row>(`users/${id}`),
    [action, setAction] = useState<"block" | "unblock" | "warnings" | null>(
      null,
    );
  const row = resource.data;
  return (
    <>
      <Back onClick={onBack} />
      <ResourceState
        error={resource.error}
        loading={!row}
        onRetry={resource.retry}
      />
      {row ? (
        <>
          <section className="staff-card">
            <h2>
              {text(row.name)}
              <VerifiedOrganizerBadge
                verified={!!row.organizerVerifiedAt && !row.blockedAt}
              />
            </h2>
            <Info
              pairs={[
                ["ID", <span className="staff-id">{id}</span>],
                ["Email", text(row.email)],
                [t("Телефон", "Телефон", "Phone"), text(row.phone)],
                [
                  t("Регистрация", "Тіркелді", "Registered"),
                  date(row.createdAt),
                ],
                [
                  t("Событий создано", "Жасалған іс-шаралар", "Events created"),
                  text(row.eventsCreated),
                ],
                [
                  t("Билетов продано", "Сатылған билеттер", "Tickets sold"),
                  text(row.ticketsSold),
                ],
              ]}
            />
            {row.blockedAt ? (
              <p className="staff-error">
                {t("Заблокирован", "Бұғатталған", "Blocked")}:{" "}
                {text(row.blockedReason)}
              </p>
            ) : null}
            {staff.role === "moderator" ? (
              <div className="staff-actions">
                <button
                  onClick={() => setAction(row.blockedAt ? "unblock" : "block")}
                >
                  {row.blockedAt
                    ? t("Разблокировать", "Бұғаттан шығару", "Unblock")
                    : t("Заблокировать", "Бұғаттау", "Block")}
                </button>
                <button onClick={() => setAction("warnings")}>
                  {t(
                    "Записать предупреждение",
                    "Ескерту жазу",
                    "Record warning",
                  )}
                </button>
              </div>
            ) : null}
          </section>
          {staff.role === "moderator" && row.role !== "guest" ? (
            <VerificationReviews
              organizerId={id}
              openCase={openCase}
              onChanged={resource.retry}
            />
          ) : null}
          <section className="staff-card">
            <h2>{t("Заказы", "Тапсырыстар", "Orders")}</h2>
            <Table
              rows={list(row.orders)}
              columns={[
                { key: "id", label: "ID" },
                {
                  key: "amount",
                  label: t("Сумма", "Сома", "Amount"),
                  render: (value) => money(value.amount, value.currency),
                },
                {
                  key: "paymentStatus",
                  label: t("Оплата", "Төлем", "Payment"),
                  render: (value) => <Status value={value.paymentStatus} />,
                },
              ]}
            />
          </section>
          <section className="staff-card">
            <h2>{t("Обращения", "Өтініштер", "Support")}</h2>
            {list(row.cases).map((value) => (
              <button
                key={String(value.id)}
                className="staff-case-button"
                onClick={() => openCase(String(value.id))}
              >
                {text(value.subject)} <Status value={value.status} />
              </button>
            ))}
          </section>
          {staff.role === "moderator" ? (
            <section className="staff-card">
              <h2>
                {t(
                  "История решений и нарушений",
                  "Шешімдер мен бұзушылықтар",
                  "Decisions & violations",
                )}
              </h2>
              <Table
                rows={list(row.history)}
                columns={[
                  {
                    key: "createdAt",
                    label: t("Дата", "Күні", "Date"),
                    render: (value) => date(value.createdAt),
                  },
                  { key: "action", label: t("Действие", "Әрекет", "Action") },
                  { key: "reason", label: t("Причина", "Себеп", "Reason") },
                ]}
              />
            </section>
          ) : null}
        </>
      ) : null}
      {action ? (
        <ActionDialog
          title={
            action === "block"
              ? t(
                  "Заблокировать пользователя",
                  "Пайдаланушыны бұғаттау",
                  "Block account",
                )
              : action === "unblock"
                ? t(
                    "Восстановить доступ",
                    "Қолжетімділікті қалпына келтіру",
                    "Restore access",
                  )
                : t("Записать предупреждение", "Ескерту жазу", "Record warning")
          }
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await staffRequest(`users/${id}/${action}`, { reason });
            resource.retry();
          }}
        >
          <p>
            {t(
              "История покупок и обращений сохранится.",
              "Сатып алулар мен өтініштер тарихы сақталады.",
              "Purchase and support history will be preserved.",
            )}
          </p>
        </ActionDialog>
      ) : null}
    </>
  );
}
function VerificationReviews({
  organizerId,
  openCase,
  onChanged,
}: {
  organizerId: string;
  openCase: (id: string) => void;
  onChanged: () => void;
}) {
  const t = useText(),
    resource = useResource<VerificationView[]>(
      `verifications?organizerId=${organizerId}`,
    ),
    [decision, setDecision] = useState<{ id: string; decision: string } | null>(
      null,
    );
  return (
    <section className="staff-card">
      <h2>
        {t(
          "Проверка организатора",
          "Ұйымдастырушыны тексеру",
          "Organizer verification",
        )}
      </h2>
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {resource.data?.length === 0 ? (
        <p>
          {t(
            "Заявка не подана",
            "Өтініш берілмеген",
            "No application submitted",
          )}
        </p>
      ) : null}
      {resource.data?.map((row) => (
        <article className="staff-verification" key={row.id}>
          <div className="staff-toolbar">
            <h3>
              {row.legalName} · #{row.version}
            </h3>
            <Status value={row.status} />
          </div>
          <Info
            pairs={[
              [t("Тип", "Түрі", "Entity type"), row.entityType.toUpperCase()],
              [t("Страна", "Ел", "Country"), row.countryCode],
              [
                t(
                  "Регистрационный номер",
                  "Тіркеу нөмірі",
                  "Registration number",
                ),
                row.registrationId,
              ],
              ["Email", row.email],
              [t("Телефон", "Телефон", "Phone"), row.phone],
            ]}
          />
          {row.documents.map((file) => (
            <a
              className="staff-file"
              key={file.id}
              href={`/staff-api/files/${file.id}`}
              download
            >
              {file.name}
            </a>
          ))}
          {row.reviewReason ? <p>{row.reviewReason}</p> : null}
          <div className="staff-actions">
            <button onClick={() => openCase(row.caseId)}>
              {t(
                "Переписка по заявке",
                "Өтініш хаттары",
                "Application conversation",
              )}
            </button>
            {row.status === "pending" ? (
              <>
                <button
                  onClick={() =>
                    setDecision({ id: row.id, decision: "verified" })
                  }
                >
                  {t("Подтвердить", "Растау", "Approve")}
                </button>
                <button
                  onClick={() =>
                    setDecision({ id: row.id, decision: "changes_requested" })
                  }
                >
                  {t("Запросить изменения", "Өзгеріс сұрау", "Request changes")}
                </button>
                <button
                  onClick={() =>
                    setDecision({ id: row.id, decision: "rejected" })
                  }
                >
                  {t("Отклонить", "Қабылдамау", "Reject")}
                </button>
              </>
            ) : row.status === "verified" ? (
              <button
                onClick={() => setDecision({ id: row.id, decision: "revoked" })}
              >
                {t(
                  "Отозвать проверку",
                  "Растауды қайтару",
                  "Revoke verification",
                )}
              </button>
            ) : null}
          </div>
        </article>
      ))}
      {decision ? (
        <ActionDialog
          title={t(
            "Решение по проверке",
            "Тексеру шешімі",
            "Verification decision",
          )}
          onClose={() => setDecision(null)}
          onSubmit={async (reason) => {
            await staffRequest(`verifications/${decision.id}/review`, {
              decision: decision.decision,
              reason,
            });
            resource.retry();
            onChanged();
          }}
        >
          <Status value={decision.decision} />
        </ActionDialog>
      ) : null}
    </section>
  );
}
export function StaffEvents() {
  const t = useText(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [id, setId] = useState<string | null>(null),
    [action, setAction] = useState<string | null>(null),
    [notify, setNotify] = useState(false),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [organizerId, setOrganizerId] = useState("");
  const resource = useResource<Paged<Row>>(
      `events?page=${page}&search=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}${organizerId ? `&organizerId=${organizerId}` : ""}`,
    ),
    detail = useResource<Row>(id ? `events/${id}` : null);
  return (
    <>
      {id ? (
        <>
          <Back onClick={() => setId(null)} />
          <ResourceState
            error={detail.error}
            loading={!detail.data}
            onRetry={detail.retry}
          />
          {detail.data ? (
            <section className="staff-card">
              <h2>{text(detail.data.title)}</h2>
              <Info
                pairs={[
                  [
                    t("Организатор", "Ұйымдастырушы", "Organizer"),
                    text(obj(detail.data.organizer).name),
                  ],
                  [t("Дата", "Күні", "Date"), date(detail.data.date)],
                  [
                    t("Адрес", "Мекенжай", "Address"),
                    text(detail.data.address),
                  ],
                  [
                    t(
                      "Оплаченных заказов затронуто",
                      "Ақылы тапсырыстар саны",
                      "Affected paid orders",
                    ),
                    text(detail.data.affectedPaidOrders),
                  ],
                ]}
              />
              <p>{text(detail.data.description)}</p>
              <h3>
                {t(
                  "Уведомления об отмене",
                  "Болдырмау хабарламалары",
                  "Cancellation notifications",
                )}
              </h3>
              <Table
                rows={list(detail.data.notificationOutcomes)}
                columns={[
                  { key: "channel", label: t("Канал", "Арна", "Channel") },
                  { key: "status", label: t("Статус", "Күйі", "Status") },
                  { key: "count", label: t("Количество", "Саны", "Count") },
                ]}
              />
              <h3>
                {t(
                  "Возвраты по событию",
                  "Іс-шара қайтарулары",
                  "Event refunds",
                )}
              </h3>
              <Table
                rows={list(detail.data.refundWork)}
                columns={[
                  { key: "status", label: t("Статус", "Күйі", "Status") },
                  { key: "count", label: t("Количество", "Саны", "Count") },
                ]}
              />
              <Status value={detail.data.status} />
              <Status value={detail.data.moderationStatus} />
              <p>{text(detail.data.moderationReason)}</p>
              <div className="staff-actions">
                {[
                  ["approve", t("Одобрить", "Мақұлдау", "Approve")],
                  ["reject", t("Отклонить", "Қабылдамау", "Reject")],
                  ["hide", t("Скрыть", "Жасыру", "Hide")],
                  ["unhide", t("Показать", "Көрсету", "Unhide")],
                  [
                    "pause",
                    t("Остановить продажи", "Сатуды тоқтату", "Pause sales"),
                  ],
                  [
                    "resume",
                    t(
                      "Продолжить продажи",
                      "Сатуды жалғастыру",
                      "Resume sales",
                    ),
                  ],
                  [
                    "cancel",
                    t(
                      "Отменить событие",
                      "Іс-шараны болдырмау",
                      "Cancel event",
                    ),
                  ],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setAction(value!);
                      setNotify(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="staff-card">
          <div className="staff-toolbar">
            <Search
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
            <label>
              {t("С даты", "Бастап", "From")}
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              {t("По дату", "Дейін", "To")}
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              {t("Организатор ID", "Ұйымдастырушы ID", "Organizer ID")}
              <input
                value={organizerId}
                onChange={(e) => {
                  setOrganizerId(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <StaffSelect
              aria-label={t("Модерация", "Модерация", "Moderation")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {t("Все состояния", "Барлық күйлер", "All states")}
              </option>
              {[
                "clear",
                "pending",
                "approved",
                "hidden",
                "sales_paused",
                "rejected",
                "cancelled",
              ].map((v) => (
                <option key={v} value={v}>
                  {
                    (
                      {
                        clear: t("Доступно", "Қолжетімді", "Available"),
                        pending: t(
                          "На проверке",
                          "Тексерілуде",
                          "Pending review",
                        ),
                        approved: t("Одобрено", "Мақұлданды", "Approved"),
                        hidden: t("Скрыто", "Жасырылған", "Hidden"),
                        sales_paused: t(
                          "Продажи остановлены",
                          "Сату тоқтатылды",
                          "Sales paused",
                        ),
                        rejected: t("Отклонено", "Қабылданбады", "Rejected"),
                        cancelled: t("Отменено", "Болдырылмады", "Cancelled"),
                      } as Record<string, string>
                    )[v]
                  }
                </option>
              ))}
            </StaffSelect>
          </div>
          <p className="staff-result-count">
            {t("Всего", "Барлығы", "Total")}: {resource.data?.total ?? "…"}
          </p>
          <ResourceState
            error={resource.error}
            loading={!resource.data}
            onRetry={resource.retry}
          />
          {resource.data ? (
            <>
              <Table
                rows={resource.data.items}
                columns={[
                  { key: "title", label: t("Мероприятие", "Іс-шара", "Event") },
                  {
                    key: "organizer",
                    label: t("Организатор", "Ұйымдастырушы", "Organizer"),
                    render: (row) => (
                      <>
                        {text(obj(row.organizer).name)}
                        <VerifiedOrganizerBadge
                          verified={
                            !!obj(row.organizer).organizerVerifiedAt &&
                            !obj(row.organizer).blockedAt
                          }
                        />
                      </>
                    ),
                  },
                  {
                    key: "date",
                    label: t("Дата", "Күні", "Date"),
                    render: (row) => date(row.date),
                  },
                  {
                    key: "moderationStatus",
                    label: t("Модерация", "Модерация", "Moderation"),
                    render: (row) => <Status value={row.moderationStatus} />,
                  },
                  {
                    key: "ticketsSold",
                    label: t(
                      "Билетов продано",
                      "Сатылған билеттер",
                      "Tickets sold",
                    ),
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
      )}
      {action && id ? (
        <ActionDialog
          title={t(
            "Решение по мероприятию",
            "Іс-шара туралы шешім",
            "Event decision",
          )}
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await staffRequest(`events/${id}/moderate`, {
              action,
              reason,
              notify,
            });
            detail.retry();
            resource.retry();
          }}
        >
          <Status value={action} />
          {action === "cancel" ? (
            <>
              <p>
                {t(
                  "Продажи остановятся. Возвраты выполняются отдельно по заказам.",
                  "Сату тоқтайды. Қайтарулар тапсырыстар бойынша бөлек жасалады.",
                  "Sales will stop. Refunds are processed separately for each order.",
                )}
              </p>
              <label className="staff-inline">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                />
                {t(
                  "Уведомить покупателей",
                  "Сатып алушыларға хабарлау",
                  "Notify buyers",
                )}
              </label>
            </>
          ) : null}
        </ActionDialog>
      ) : null}
    </>
  );
}
function OperationalIssues({
  value,
  openOrder,
}: {
  value: Row | null;
  openOrder: (id: string) => void;
}) {
  const t = useText();
  const rows = [
    ...list(value?.missingTickets).map((row) => ({
      ...row,
      problem: t(
        "Оплачен, билеты отсутствуют — требуется разбор",
        "Төленген, билет жоқ — тексеру қажет",
        "Paid without tickets — review required",
      ),
    })),
    ...list(value?.failedDelivery).map((row) => ({
      ...row,
      id: row.orderId,
      problem: t(
        "Ошибка доставки — откройте заказ для повторной отправки",
        "Жеткізу қатесі — қайта жіберу үшін тапсырысты ашыңыз",
        "Delivery failed — open order to resend",
      ),
    })),
    ...list(value?.stuckRefunds).map((row) => ({
      ...row,
      id: row.orderId,
      problem: t(
        "Возврат ожидает сверки",
        "Қайтару салыстыруды күтуде",
        "Refund needs reconciliation",
      ),
    })),
    ...list(value?.mismatches).map((row) => ({
      ...row,
      id: row.aggregateId,
      problem: t(
        "Платёж требует ручной сверки",
        "Төлемді қолмен салыстыру қажет",
        "Payment requires manual reconciliation",
      ),
    })),
  ];
  return rows.length ? (
    <details className="staff-card">
      <summary>
        {t("Требуют внимания", "Назар аударуды қажет етеді", "Needs attention")}{" "}
        · {rows.length}
      </summary>
      <Table
        rows={rows}
        columns={[
          { key: "id", label: t("Заказ", "Тапсырыс", "Order") },
          { key: "problem", label: t("Причина", "Себеп", "Reason") },
        ]}
        onRow={(row) => openOrder(String(row.id))}
      />
    </details>
  ) : null;
}
export function StaffOrders({
  staff,
  initialId,
  onConsumed,
}: {
  staff: StaffUser;
  initialId: string | null;
  onConsumed: () => void;
}) {
  const t = useText(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (initialId) {
      setId(initialId);
      onConsumed();
    }
  }, [initialId, onConsumed]);
  const issues = useResource<Row>("issues");
  const resource = useResource<Paged<Row>>(
    `orders?page=${page}&search=${encodeURIComponent(q)}`,
  );
  if (id)
    return (
      <OrderDetails
        id={id}
        staff={staff}
        onBack={() => {
          setId(null);
          resource.retry();
        }}
      />
    );
  return (
    <section className="staff-card">
      <OperationalIssues value={issues.data} openOrder={setId} />
      <Search
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <p className="staff-result-count">
        {t("Заказов", "Тапсырыстар", "Orders")}: {resource.data?.total ?? "…"}
      </p>
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {resource.data ? (
        <>
          <Table
            rows={resource.data.items}
            columns={[
              { key: "id", label: t("Заказ", "Тапсырыс", "Order") },
              {
                key: "buyer",
                label: t("Покупатель", "Сатып алушы", "Buyer"),
                render: (row) =>
                  text(obj(row.buyer).name ?? obj(row.anonymousSession).name),
              },
              {
                key: "amount",
                label: t("Сумма", "Сома", "Amount"),
                render: (row) => money(row.amount, row.currency),
              },
              {
                key: "paymentStatus",
                label: t("Оплата", "Төлем", "Payment"),
                render: (row) => <Status value={row.paymentStatus} />,
              },
              {
                key: "createdAt",
                label: t("Дата", "Күні", "Date"),
                render: (row) => date(row.createdAt),
              },
            ]}
            onRow={(row) => setId(String(row.id))}
          />
          <Pager
            page={page}
            total={resource.data.total}
            limit={20}
            onPage={setPage}
          />
        </>
      ) : null}
    </section>
  );
}
function OrderDetails({
  id,
  staff,
  onBack,
}: {
  id: string;
  staff: StaffUser;
  onBack: () => void;
}) {
  const t = useText(),
    locale = useLocale(),
    resource = useResource<Row>(`orders/${id}`),
    [action, setAction] = useState<"refund" | "resend" | "cancel" | null>(null),
    [selection, setSelection] = useState<string[]>([]),
    [override, setOverride] = useState(false),
    [channel, setChannel] = useState("auto"),
    [notice, setNotice] = useState("");
  const quote = useResource<Row>(
    `orders/${id}/refund${selection.length ? `?tickets=${selection.join(",")}` : ""}`,
  );
  const key = useRef(crypto.randomUUID());
  const row = resource.data;
  function open(next: typeof action) {
    key.current = crypto.randomUUID();
    setSelection([]);
    setOverride(false);
    setAction(next);
  }
  return (
    <>
      <Back onClick={onBack} />
      <ResourceState
        error={resource.error}
        loading={!row}
        onRetry={resource.retry}
      />
      {notice ? <p role="status">{notice}</p> : null}
      {row ? (
        <>
          <section className="staff-card">
            {list(row.payments).some((value) => value.provider === "mock") ? (
              <p className="staff-warning">
                {t(
                  "Тестовый платёж: реальные деньги не перемещаются.",
                  "Тест төлемі: нақты ақша аударылмайды.",
                  "Test payment: no real money is transferred.",
                )}
              </p>
            ) : null}
            <h2>
              {t("Заказ", "Тапсырыс", "Order")}{" "}
              <span className="staff-id">{id}</span>
            </h2>
            <Info
              pairs={[
                [
                  t("Покупатель", "Сатып алушы", "Buyer"),
                  text(obj(row.buyer).name ?? obj(row.anonymousSession).name),
                ],
                [t("Сумма", "Сома", "Amount"), money(row.amount, row.currency)],
                [t("Дата", "Күні", "Date"), date(row.createdAt)],
                [
                  t("Оплата", "Төлем", "Payment"),
                  <Status value={row.paymentStatus} />,
                ],
                [
                  t("Email-доставка", "Email жеткізу", "Email delivery"),
                  <Status
                    value={
                      obj(row.ticketEmailDelivery).status ?? "not_requested"
                    }
                  />,
                ],
              ]}
            />
            <div className="staff-actions">
              <button onClick={() => open("resend")}>
                {t(
                  "Переотправить билет",
                  "Билетті қайта жіберу",
                  "Resend ticket",
                )}
              </button>
              <button onClick={() => open("refund")}>
                {t("Сделать возврат", "Қайтару жасау", "Refund")}
              </button>
              <button onClick={() => open("cancel")}>
                {t(
                  "Отменить неоплаченный / бесплатный заказ",
                  "Төленбеген / тегін тапсырысты болдырмау",
                  "Cancel unpaid / free order",
                )}
              </button>
            </div>
          </section>
          <section className="staff-card">
            <h2>{t("Билеты", "Билеттер", "Tickets")}</h2>
            <Table
              rows={list(row.tickets)}
              columns={[
                {
                  key: "id",
                  label: t("Номер", "Нөмірі", "Number"),
                  render: (ticket) =>
                    `TKT-${String(ticket.id).replaceAll("-", "").toUpperCase()}`,
                },
                {
                  key: "ticketType",
                  label: t("Билет", "Билет", "Ticket"),
                  render: (ticket) => text(obj(ticket.ticketType).name),
                },
                {
                  key: "status",
                  label: t("Статус", "Күйі", "Status"),
                  render: (ticket) => <Status value={ticket.status} />,
                },
                {
                  key: "usedAt",
                  label: t("Использован", "Қолданылған", "Used at"),
                  render: (ticket) => date(ticket.usedAt),
                },
              ]}
            />
          </section>
          <section className="staff-card">
            <h2>
              {t(
                "Платежи и возвраты",
                "Төлемдер мен қайтарулар",
                "Payments & refunds",
              )}
            </h2>
            <Table
              rows={list(row.payments)}
              columns={[
                {
                  key: "providerPaymentId",
                  label: t("Платёж", "Төлем", "Payment reference"),
                },
                {
                  key: "provider",
                  label: t("Провайдер", "Провайдер", "Provider"),
                },
                {
                  key: "amount",
                  label: t("Сумма", "Сома", "Amount"),
                  render: (value) => money(value.amount, value.currency),
                },
                {
                  key: "status",
                  label: t("Статус", "Күйі", "Status"),
                  render: (value) => <Status value={value.status} />,
                },
              ]}
            />
            <Table
              rows={list(row.refunds)}
              columns={[
                { key: "id", label: t("Возврат", "Қайтару", "Refund") },
                {
                  key: "amount",
                  label: t("Сумма", "Сома", "Amount"),
                  render: (value) => money(value.amount, value.currency),
                },
                {
                  key: "status",
                  label: t("Статус", "Күйі", "Status"),
                  render: (value) => <Status value={value.status} />,
                },
                {
                  key: "lastError",
                  label: t("Результат", "Нәтиже", "Outcome"),
                },
              ]}
            />
            {list(row.refunds)
              .filter((value) => value.status === "processing")
              .map((value) => (
                <button
                  key={String(value.id)}
                  onClick={() =>
                    void staffRequest(`refunds/${value.id}/reconcile`, {})
                      .then(() => {
                        resource.retry();
                        quote.retry();
                      })
                      .catch((reason) => setNotice(errorText(reason, locale)))
                  }
                >
                  {t(
                    "Проверить результат возврата",
                    "Қайтару нәтижесін тексеру",
                    "Reconcile refund",
                  )}
                </button>
              ))}
          </section>
        </>
      ) : null}
      {action ? (
        <ActionDialog
          disabled={
            action === "refund" &&
            (!quote.data ||
              !!quote.error ||
              quote.data.selectedAmount === null ||
              !!quote.data.reason)
          }
          title={
            action === "refund"
              ? t("Подтвердить возврат", "Қайтаруды растау", "Confirm refund")
              : action === "resend"
                ? t(
                    "Повторная отправка билета",
                    "Билетті қайта жіберу",
                    "Resend ticket",
                  )
                : t("Отмена заказа", "Тапсырысты болдырмау", "Cancel order")
          }
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            const response = await staffRequest<Row>(`orders/${id}/${action}`, {
              reason,
              key: key.current,
              ...(action === "resend" ? { channel } : {}),
              ...(action === "refund"
                ? {
                    override,
                    ...(selection.length ? { ticketIds: selection } : {}),
                  }
                : {}),
            });
            setNotice(
              t(
                "Действие принято. Статус",
                "Әрекет қабылданды. Күйі",
                "Action accepted. Status",
              ) +
                ": " +
                ((
                  {
                    succeeded: t("Выполнено", "Орындалды", "Completed"),
                    queued: t("В очереди", "Кезекте", "Queued"),
                    processing: t(
                      "Ожидает подтверждения провайдера",
                      "Провайдер растауын күтуде",
                      "Awaiting provider confirmation",
                    ),
                    failed: t("Не выполнено", "Орындалмады", "Failed"),
                    dispatching: t(
                      "Результат отправки проверяется",
                      "Жіберу нәтижесі тексерілуде",
                      "Dispatch outcome pending",
                    ),
                  } as Record<string, string>
                )[String(response.status)] ??
                  t("Выполнено", "Орындалды", "Completed")),
            );
            resource.retry();
            quote.retry();
          }}
        >
          {action === "resend" ? (
            <label>
              {t("Канал доставки", "Жеткізу арнасы", "Delivery channel")}
              <StaffSelect
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="auto">
                  {t(
                    "Доступный сохранённый канал",
                    "Қолжетімді сақталған арна",
                    "Available saved channel",
                  )}
                </option>
                <option value="email">Email</option>
                <option value="telegram">Telegram</option>
              </StaffSelect>
            </label>
          ) : null}
          {action === "refund" ? (
            <>
              {quote.data?.testOnly ? (
                <p className="staff-warning">
                  {t(
                    "Тестовый возврат: реальные деньги не перемещаются.",
                    "Тест қайтаруы: нақты ақша аударылмайды.",
                    "Test refund: no real money is transferred.",
                  )}
                </p>
              ) : null}
              <p>
                {t(
                  "К возврату осталось",
                  "Қайтаруға қалғаны",
                  "Remaining refundable",
                )}
                : <strong>{money(quote.data?.remaining, row?.currency)}</strong>
              </p>
              <p>
                {t(
                  "Сумма выбранного возврата",
                  "Таңдалған қайтару сомасы",
                  "Selected refund amount",
                )}
                :{" "}
                <strong>
                  {money(quote.data?.selectedAmount, row?.currency)}
                </strong>
                {quote.data?.reason ? (
                  <span className="staff-error">
                    {" "}
                    · {text(quote.data.reason)}
                  </span>
                ) : null}
              </p>
              <p>
                {t(
                  "Без выбора билетов возвращается весь оставшийся заказ. Частичный возврат доступен для поддерживаемых отдельных билетов.",
                  "Билет таңдалмаса, қалған тапсырыс толық қайтарылады. Ішінара қайтару қолдау көрсетілетін жеке билеттерге қолжетімді.",
                  "Leave tickets unselected to refund the remaining order. Partial refunds support eligible individual tickets.",
                )}
              </p>
              {list(row?.tickets)
                .filter((value) =>
                  ["active", "paid", "cancelled"].includes(
                    String(value.status),
                  ),
                )
                .map((ticket) => (
                  <label className="staff-inline" key={String(ticket.id)}>
                    <input
                      type="checkbox"
                      checked={selection.includes(String(ticket.id))}
                      onChange={(e) =>
                        setSelection((values) =>
                          e.target.checked
                            ? [...values, String(ticket.id)]
                            : values.filter((value) => value !== ticket.id),
                        )
                      }
                    />
                    {text(obj(ticket.ticketType).name)} ·{" "}
                    {String(ticket.id).slice(-8)}
                  </label>
                ))}
              {staff.role === "moderator" ? (
                <label className="staff-inline">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  {t(
                    "Исключение из принятой политики возврата",
                    "Қабылданған қайтару ережесінен ерекшелік",
                    "Override accepted refund policy",
                  )}
                </label>
              ) : null}
              <p className="staff-muted">
                {t(
                  "Оплата и возврат считаются завершёнными после подтверждения провайдера.",
                  "Төлем мен қайтару провайдер растағаннан кейін аяқталады.",
                  "Refund completion follows the provider's confirmed result.",
                )}
              </p>
            </>
          ) : (
            <p>
              {action === "resend"
                ? t(
                    "Будет отправлен существующий билет по сохранённому каналу. QR-код сохранится.",
                    "Қолданыстағы билет сақталған мекенжайға жіберіледі. QR-код өзгермейді.",
                    "The existing ticket will be sent through its saved channel. Its QR code stays the same.",
                  )
                : t(
                    "Оплаченные денежные заказы отменяются через возврат.",
                    "Ақылы тапсырыс қайтару арқылы тоқтатылады.",
                    "Paid monetary orders must use the refund action.",
                  )}
            </p>
          )}
        </ActionDialog>
      ) : null}
    </>
  );
}
export function StaffFinance() {
  const t = useText(),
    [financePage, setFinancePage] = useState(1),
    [eventId, setEventId] = useState(""),
    [testOnly, setTestOnly] = useState(false),
    [organizerId, setOrganizerId] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [dialog, setDialog] = useState<"payout" | "commission" | null>(null),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState("KZT"),
    [reference, setReference] = useState(""),
    [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10)),
    [bps, setBps] = useState(""),
    [notice, setNotice] = useState(""),
    [reversal, setReversal] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID()),
    query = `testOnly=${testOnly}&page=${financePage}${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}${organizerId ? `&organizerId=${encodeURIComponent(organizerId)}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}T23:59:59Z` : ""}`,
    resource = useResource<Row>(`finance?${query}`);
  return (
    <>
      <section className="staff-card">
        <div className="staff-toolbar">
          <label>
            {t("Организатор ID", "Ұйымдастырушы ID", "Organizer ID")}
            <input
              value={organizerId}
              onChange={(e) => setOrganizerId(e.target.value)}
            />
          </label>
          <label>
            {t("Мероприятие ID", "Іс-шара ID", "Event ID")}
            <input
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setFinancePage(1);
              }}
            />
          </label>
          <label>
            {t("С даты", "Бастап", "From")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t("По дату", "Дейін", "To")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="staff-inline">
            <input
              type="checkbox"
              checked={testOnly}
              onChange={(e) => setTestOnly(e.target.checked)}
            />
            {t(
              "Тестовые платежи отдельно",
              "Тест төлемдері бөлек",
              "Show test payments separately",
            )}
          </label>
        </div>
        <div className="staff-actions">
          <a
            className="staff-button"
            href={`/staff-api/finance/export?${query}`}
            download
          >
            {t("Экспорт CSV", "CSV экспорттау", "Export CSV")}
          </a>
          <button
            onClick={() => {
              key.current = crypto.randomUUID();
              setDialog("payout");
            }}
          >
            {t(
              "Записать выполненную выплату",
              "Жасалған төлемді жазу",
              "Record completed payout",
            )}
          </button>
          <button onClick={() => setDialog("commission")}>
            {t("Настроить комиссию", "Комиссияны баптау", "Set commission")}
          </button>
        </div>
        {testOnly ? (
          <p className="staff-warning">
            {t(
              "Демонстрационные суммы — реальные деньги не перемещаются.",
              "Демо сомалар — нақты ақша аударылмайды.",
              "Demo amounts — no real money is transferred.",
            )}
          </p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        <p className="staff-muted">
          {t(
            "Комиссия по умолчанию для новых покупок",
            "Жаңа сатып алулар комиссиясы",
            "Default commission for new purchases",
          )}
          :{" "}
          {typeof resource.data?.defaultCommissionBps === "number"
            ? `${Number(resource.data.defaultCommissionBps) / 100}%`
            : t("Не задана", "Белгіленбеген", "Not set")}
        </p>
        <ResourceState
          error={resource.error}
          loading={!resource.data}
          onRetry={resource.retry}
        />
        {resource.data ? (
          <>
            <Table
              rows={list(resource.data.groups)}
              columns={[
                {
                  key: "organizerName",
                  label: t("Организатор", "Ұйымдастырушы", "Organizer"),
                },
                { key: "currency", label: t("Валюта", "Валюта", "Currency") },
                {
                  key: "gross",
                  label: t("Продажи", "Сату", "Sales"),
                  render: (row) => money(row.gross, row.currency),
                },
                {
                  key: "refunds",
                  label: t("Возвраты", "Қайтарулар", "Refunds"),
                  render: (row) => money(row.refunds, row.currency),
                },
                {
                  key: "commission",
                  label: t("Комиссия", "Комиссия", "Commission"),
                  render: (row) =>
                    row.commission === null
                      ? t(
                          "Нужна сверка",
                          "Салыстыру қажет",
                          "Needs reconciliation",
                        )
                      : money(row.commission, row.currency),
                },
                {
                  key: "payouts",
                  label: t("Выплачено", "Төленді", "Paid out"),
                  render: (row) => money(row.payouts, row.currency),
                },
                {
                  key: "outstanding",
                  label: t(
                    "Осталось выплатить",
                    "Төлеуге қалды",
                    "Outstanding",
                  ),
                  render: (row) => money(row.outstanding, row.currency),
                },
              ]}
            />
            <p className="staff-muted">
              {t(
                "Суммы показаны в валюте покупки. Исторические неизвестные комиссии требуют сверки. Комиссии платёжного провайдера показываются только при наличии подтверждённых данных.",
                "Сомалар сатып алу валютасымен көрсетілген. Белгісіз тарихи комиссияларды салыстыру керек. Провайдер комиссиясы расталғанда ғана көрсетіледі.",
                "Amounts remain in the purchase currency. Unknown historical commissions need reconciliation. Provider fees are shown only when confirmed data is available.",
              )}
            </p>
          </>
        ) : null}
      </section>
      <section className="staff-card">
        <h2>{t("Транзакции", "Транзакциялар", "Transactions")}</h2>
        <Table
          rows={list(resource.data?.transactions)}
          columns={[
            { key: "reference", label: t("Платёж", "Төлем", "Payment") },
            {
              key: "settledAt",
              label: t("Подтверждён", "Расталды", "Settled"),
              render: (row) => date(row.settledAt),
            },
            { key: "orderId", label: t("Заказ", "Тапсырыс", "Order") },
            {
              key: "amount",
              label: t("Сумма", "Сома", "Amount"),
              render: (row) => money(row.amount, row.currency),
            },
            {
              key: "refunded",
              label: t("Возвращено", "Қайтарылды", "Refunded"),
              render: (row) => money(row.refunded, row.currency),
            },
            {
              key: "reconciliationRequired",
              label: t("Сверка", "Салыстыру", "Reconciliation"),
              render: (row) =>
                row.reconciliationRequired
                  ? t("Требуется", "Қажет", "Required")
                  : "—",
            },
          ]}
        />
        <Pager
          page={financePage}
          total={Number(resource.data?.transactionTotal ?? 0)}
          limit={20}
          onPage={setFinancePage}
        />
        {list(resource.data?.unassigned).length ? (
          <p className="staff-warning">
            {t(
              "Есть платежи без определённого организатора. Нужна сверка.",
              "Ұйымдастырушысы анықталмаған төлемдер бар. Салыстыру қажет.",
              "Some payments have no identifiable organizer and require reconciliation.",
            )}
          </p>
        ) : null}
      </section>
      <section className="staff-card">
        <h2>
          {t(
            "Баланс за всё время",
            "Барлық уақыттағы баланс",
            "Lifetime balances",
          )}
        </h2>
        <Table
          rows={list(resource.data?.balances)}
          columns={[
            {
              key: "organizerName",
              label: t("Организатор", "Ұйымдастырушы", "Organizer"),
            },
            {
              key: "gross",
              label: t("Продажи", "Сату", "Sales"),
              render: (row) => money(row.gross, row.currency),
            },
            {
              key: "refunds",
              label: t("Возвраты", "Қайтарулар", "Refunds"),
              render: (row) => money(row.refunds, row.currency),
            },
            {
              key: "commission",
              label: t("Комиссия", "Комиссия", "Commission"),
              render: (row) => money(row.commission, row.currency),
            },
            {
              key: "payouts",
              label: t("Выплачено", "Төленді", "Paid out"),
              render: (row) => money(row.payouts, row.currency),
            },
            {
              key: "outstanding",
              label: t(
                "До комиссии провайдера",
                "Провайдер комиссиясына дейін",
                "Before provider fees",
              ),
              render: (row) => money(row.outstanding, row.currency),
            },
          ]}
        />
        <p className="staff-muted">
          {t(
            "Банковские комиссии и споры не поступают из текущего адаптера. Неизвестные значения требуют сверки; суммы разных валют не складываются.",
            "Қазіргі адаптер банк комиссиялары мен дауларды бермейді. Белгісіз деректерді салыстыру қажет; әртүрлі валюталар қосылмайды.",
            "The current adapter supplies no bank fees or disputes. Unknown values require reconciliation; different currencies are never added together.",
          )}
        </p>
      </section>
      <section className="staff-card">
        <h2>{t("История выплат", "Төлемдер тарихы", "Payout history")}</h2>
        <Table
          rows={list(resource.data?.payouts)}
          columns={[
            {
              key: "organizerId",
              label: t("Организатор", "Ұйымдастырушы", "Organizer"),
            },
            {
              key: "amount",
              label: t("Сумма", "Сома", "Amount"),
              render: (row) => money(row.amount, row.currency),
            },
            {
              key: "paidAt",
              label: t("Дата", "Күні", "Date"),
              render: (row) => date(row.paidAt),
            },
            {
              key: "reference",
              label: t("Подтверждение", "Растау", "Reference"),
            },
            {
              key: "reversedAt",
              label: t("Исправление", "Түзету", "Correction"),
              render: (row) =>
                row.reversedAt ? (
                  date(row.reversedAt)
                ) : (
                  <button onClick={() => setReversal(String(row.id))}>
                    {t(
                      "Отменить запись",
                      "Жазбаны кері қайтару",
                      "Reverse record",
                    )}
                  </button>
                ),
            },
          ]}
        />
      </section>
      {dialog ? (
        <ActionDialog
          title={
            dialog === "payout"
              ? t(
                  "Запись внешней выплаты",
                  "Сыртқы төлем жазбасы",
                  "Record external payout",
                )
              : t(
                  "Комиссия для новых покупок",
                  "Жаңа сатып алулар комиссиясы",
                  "Commission for new purchases",
                )
          }
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            if (dialog === "payout")
              await staffRequest("finance/payouts", {
                organizerId,
                amount: Math.round(Number(amount) * 100),
                currency,
                reference,
                paidAt: new Date(`${paidAt}T00:00:00Z`).toISOString(),
                testOnly,
                key: key.current,
              });
            else
              await staffRequest(
                "finance/commission",
                {
                  ...(organizerId ? { organizerId } : {}),
                  basisPoints: Math.round(Number(bps) * 100),
                  reason,
                },
                "PATCH",
              );
            setNotice(t("Сохранено", "Сақталды", "Saved"));
            resource.retry();
          }}
        >
          <label>
            {t(
              "Организатор ID (для общей комиссии оставьте пустым)",
              "Ұйымдастырушы ID (жалпы комиссия үшін бос қалдырыңыз)",
              "Organizer ID (leave blank for default commission)",
            )}
            <input
              required={dialog === "payout"}
              value={organizerId}
              onChange={(e) => setOrganizerId(e.target.value)}
            />
          </label>
          {dialog === "payout" ? (
            <>
              <p>
                {t(
                  "Это запись уже выполненной выплаты. Банковский перевод не запускается.",
                  "Бұл жасалған төлем жазбасы. Банк аударымы жасалмайды.",
                  "This records a payout already made externally. It does not initiate a bank transfer.",
                )}
              </p>
              <label>
                {t("Сумма", "Сома", "Amount")}
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                {t("Валюта", "Валюта", "Currency")}
                <input
                  required
                  pattern="[A-Z]{3}"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </label>
              <label>
                {t(
                  "Подтверждение / номер перевода",
                  "Растау / аударым нөмірі",
                  "Reference / transfer number",
                )}
                <input
                  required
                  minLength={3}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <label>
                {t("Дата выплаты", "Төлем күні", "Payout date")}
                <input
                  required
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              {t("Комиссия, %", "Комиссия, %", "Commission, %")}
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={bps}
                onChange={(e) => setBps(e.target.value)}
              />
            </label>
          )}
        </ActionDialog>
      ) : null}
      {reversal ? (
        <ActionDialog
          title={t(
            "Исправить запись выплаты",
            "Төлем жазбасын түзету",
            "Reverse payout record",
          )}
          onClose={() => setReversal(null)}
          onSubmit={async (reason) => {
            await staffRequest(`finance/payouts/${reversal}/reverse`, {
              reason,
            });
            resource.retry();
          }}
        >
          <p>
            {t(
              "Исходная запись сохранится в истории.",
              "Бастапқы жазба тарихта сақталады.",
              "The original record remains in history.",
            )}
          </p>
        </ActionDialog>
      ) : null}
    </>
  );
}
export function StaffActivity() {
  const t = useText(),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const resource = useResource<Paged<Row>>(
    `audit?page=${page}&search=${encodeURIComponent(q)}`,
  );
  return (
    <section className="staff-card">
      <Search
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
      />
      <ResourceState
        error={resource.error}
        loading={!resource.data}
        onRetry={resource.retry}
      />
      {resource.data ? (
        <>
          <Table
            rows={resource.data.items}
            columns={[
              {
                key: "createdAt",
                label: t("Дата", "Күні", "Date"),
                render: (row) => date(row.createdAt),
              },
              {
                key: "staff",
                label: t("Сотрудник", "Қызметкер", "Staff"),
                render: (row) => text(obj(row.staff).name ?? row.role),
              },
              { key: "action", label: t("Действие", "Әрекет", "Action") },
              { key: "targetId", label: t("Объект", "Нысан", "Record") },
              { key: "reason", label: t("Причина", "Себеп", "Reason") },
              {
                key: "after",
                label: t("Изменения", "Өзгерістер", "Changes"),
                render: (row) => (
                  <details>
                    <summary>{t("Подробнее", "Толығырақ", "Details")}</summary>
                    <pre>
                      {JSON.stringify(
                        { before: row.before, after: row.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ),
              },
            ]}
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
function StaffMfaReset() {
  const t = useText(),
    locale = useLocale(),
    [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {t(
          "Заменить приложение-аутентификатор",
          "Аутентификаторды ауыстыру",
          "Replace authenticator",
        )}
      </button>
      {open ? (
        <form
          className="staff-card"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              await staffRequest("auth/mfa/reset", { password, code });
              location.replace("/admin/login");
            } catch (e) {
              setError(errorText(e, locale));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {t(
              "Подтвердите пароль и новый код приложения или неиспользованный код восстановления. Все сессии завершатся. При следующем входе потребуется настроить MFA заново.",
              "Құпиясөзді және жаңа қолданба кодын не қолданылмаған қалпына келтіру кодын растаңыз. Барлық сеанстар аяқталып, MFA қайта орнатылады.",
              "Confirm your password and a fresh authenticator or unused recovery code. All sessions end and the next sign-in requires MFA enrollment.",
            )}
          </p>
          <label>
            {t("Пароль", "Құпиясөз", "Password")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            {t("Код", "Код", "Code")}
            <input
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button disabled={busy}>
            {t(
              "Подтвердить замену",
              "Ауыстыруды растау",
              "Confirm replacement",
            )}
          </button>
        </form>
      ) : null}
    </div>
  );
}
export function StaffSettings({ staff }: { staff: StaffUser }) {
  const t = useText(),
    locale = useLocale(),
    sessions = useResource<Row[]>("auth/sessions"),
    team = useResource<Row[]>(staff.role === "moderator" ? "auth/team" : null),
    [invite, setInvite] = useState(false),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [role, setRole] = useState("support"),
    [change, setChange] = useState<Row | null>(null),
    [disabled, setDisabled] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <>
      <section className="staff-card">
        <h2>
          {t(
            "Безопасность аккаунта",
            "Аккаунт қауіпсіздігі",
            "Account security",
          )}
        </h2>
        <p>
          {t(
            "Двухфакторный вход включён.",
            "Екі факторлы кіру қосылған.",
            "Two-factor authentication is enabled.",
          )}
        </p>
        {notice ? <p role="status">{notice}</p> : null}
        <StaffMfaReset />
        <h3>{t("Активные сессии", "Белсенді сеанстар", "Active sessions")}</h3>
        <ResourceState
          error={sessions.error}
          loading={!sessions.data}
          onRetry={sessions.retry}
        />
        {sessions.data?.map((row) => (
          <div className="staff-session" key={String(row.id)}>
            <span>
              {date(row.createdAt)} → {date(row.expiresAt)}
            </span>
            <button
              onClick={() =>
                void staffRequest(`auth/sessions/${row.id}/revoke`, {})
                  .then(() => {
                    sessions.retry();
                  })
                  .catch((error) => setNotice(errorText(error, locale)))
              }
            >
              {t("Завершить сессию", "Сеансты аяқтау", "Revoke session")}
            </button>
          </div>
        ))}
      </section>
      {staff.role === "moderator" ? (
        <section className="staff-card">
          <div className="staff-toolbar">
            <h2>{t("Сотрудники", "Қызметкерлер", "Staff")}</h2>
            <button className="staff-primary" onClick={() => setInvite(true)}>
              {t("Пригласить сотрудника", "Қызметкерді шақыру", "Invite staff")}
            </button>
          </div>
          <ResourceState
            error={team.error}
            loading={!team.data}
            onRetry={team.retry}
          />
          {team.data ? (
            <Table
              rows={team.data}
              columns={[
                { key: "name", label: t("Имя", "Аты", "Name") },
                { key: "email", label: "Email" },
                {
                  key: "role",
                  label: t("Роль", "Рөлі", "Role"),
                  render: (row) => <Status value={row.role} />,
                },
                {
                  key: "disabledAt",
                  label: t("Доступ", "Қолжетімділік", "Access"),
                  render: (row) =>
                    row.disabledAt
                      ? t("Отключён", "Өшірілген", "Disabled")
                      : t("Активен", "Белсенді", "Active"),
                },
                {
                  key: "id",
                  label: t("Действия", "Әрекеттер", "Actions"),
                  render: (row) => (
                    <button
                      onClick={() => {
                        setChange(row);
                        setRole(String(row.role));
                        setDisabled(!!row.disabledAt);
                      }}
                    >
                      {t("Изменить", "Өзгерту", "Edit")}
                    </button>
                  ),
                },
              ]}
            />
          ) : null}
        </section>
      ) : null}
      {invite ? (
        <ActionDialog
          title={t(
            "Пригласить сотрудника",
            "Қызметкерді шақыру",
            "Invite staff",
          )}
          onClose={() => setInvite(false)}
          onSubmit={async () => {
            await staffRequest("auth/team/invite", { email, name, role });
            setNotice(
              t(
                "Приглашение отправлено",
                "Шақыру жіберілді",
                "Invitation sent",
              ),
            );
            team.retry();
          }}
        >
          <label>
            {t("Имя", "Аты", "Name")}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {t("Роль", "Рөлі", "Role")}
            <StaffSelect value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="support">
                {t("Поддержка", "Қолдау", "Support")}
              </option>
              <option value="moderator">
                {t("Модератор", "Модератор", "Moderator")}
              </option>
            </StaffSelect>
          </label>
        </ActionDialog>
      ) : null}
      {change ? (
        <ActionDialog
          title={t(
            "Доступ сотрудника",
            "Қызметкер қолжетімділігі",
            "Staff access",
          )}
          onClose={() => setChange(null)}
          onSubmit={async (reason) => {
            await staffRequest(
              `auth/team/${change.id}`,
              { role, disabled, reason },
              "PATCH",
            );
            team.retry();
          }}
        >
          <p>{text(change.email)}</p>
          <label>
            {t("Роль", "Рөлі", "Role")}
            <StaffSelect value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="support">
                {t("Поддержка", "Қолдау", "Support")}
              </option>
              <option value="moderator">
                {t("Модератор", "Модератор", "Moderator")}
              </option>
            </StaffSelect>
          </label>
          <label className="staff-inline">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />
            {t("Отключить доступ", "Қолжетімділікті өшіру", "Disable access")}
          </label>
          <p>
            {t(
              "Все сессии сотрудника будут завершены.",
              "Қызметкердің барлық сеанстары аяқталады.",
              "All staff sessions will be revoked.",
            )}
          </p>
        </ActionDialog>
      ) : null}
    </>
  );
}
