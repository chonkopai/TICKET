"use client";
import { useEffect, useState } from "react";
import type { StaffSessionView, StaffUser } from "@event-platform/shared-types";
import { useLocale } from "../../components/locale-provider";
import { ThemeToggle } from "../../components/theme-toggle";
import { staffRequest, setStaffCsrf, errorText } from "./staff-client";
import { useText } from "./staff-ui";
import { StaffIcon, type StaffIconName } from "./staff-icon";
import { StaffSupportInbox } from "./support-inbox";
import {
  StaffPeople,
  StaffEvents,
  StaffOrders,
  StaffFinance,
  StaffActivity,
  StaffSettings,
} from "./workspace-sections";
type Section =
  | "support"
  | "users"
  | "events"
  | "orders"
  | "finance"
  | "audit"
  | "settings";
export default function AdminConsole() {
  const t = useText(),
    locale = useLocale(),
    [staff, setStaff] = useState<StaffUser | null>(null),
    [section, setSection] = useState<Section>("support"),
    [caseId, setCaseId] = useState<string | null>(null),
    [orderId, setOrderId] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void staffRequest<StaffSessionView>("auth/session")
      .then((value) => {
        setStaffCsrf(value.csrf);
        if (!value.authenticated) {
          location.replace("/admin/login");
          return;
        }
        setStaff(value.staff);
      })
      .catch(() => location.replace("/admin/login"));
  }, []);
  if (!staff)
    return (
      <main className="staff-login">
        <p role="status">{t("Загрузка…", "Жүктелуде…", "Loading…")}</p>
      </main>
    );
  const nav: {
    id: Section;
    label: string;
    icon: StaffIconName;
    moderator?: boolean;
  }[] = [
    { id: "support", label: t("Поддержка", "Қолдау", "Support"), icon: "support" },
    {
      id: "users",
      label: t("Пользователи", "Пайдаланушылар", "People"),
      icon: "users",
    },
    {
      id: "events",
      label: t("Мероприятия", "Іс-шаралар", "Events"),
      icon: "events",
      moderator: true,
    },
    {
      id: "orders",
      label: t(
        "Заказы и билеты",
        "Тапсырыстар мен билеттер",
        "Orders & tickets",
      ),
      icon: "orders",
    },
    {
      id: "finance",
      label: t("Финансы", "Қаржы", "Finance"),
      icon: "finance",
      moderator: true,
    },
    {
      id: "audit",
      label: t("Журнал действий", "Әрекеттер журналы", "Activity log"),
      icon: "audit",
      moderator: true,
    },
  ];
  const openCase = (id: string) => {
    setCaseId(id);
    setSection("support");
  };
  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <p className="staff-brand">
          TICKET <span>Admin</span>
        </p>
        <div className="staff-profile">
          <span className="staff-avatar">
            <StaffIcon name={staff.role === "moderator" ? "moderator" : "support"} />
          </span>
          <div>
            <p className="staff-profile-name">{staff.name}</p>
            <p className="staff-muted">
              {staff.role === "moderator"
                ? t("Модератор", "Модератор", "Moderator")
                : t("Поддержка", "Қолдау", "Support")}
            </p>
          </div>
        </div>
        <nav
          aria-label={t(
            "Разделы администрирования",
            "Әкімшілік бөлімдер",
            "Administration",
          )}
        >
          {nav
            .filter((item) => !item.moderator || staff.role === "moderator")
            .map((item) => (
              <button
                key={item.id}
                aria-current={section === item.id ? "page" : undefined}
                className={section === item.id ? "is-active" : ""}
                onClick={() => setSection(item.id)}
              >
                <StaffIcon name={item.icon} />
                {item.label}
              </button>
            ))}
        </nav>
        <div className="staff-sidebar-bottom">
          <button
            className={`staff-sidebar-action ${section === "settings" ? "is-active" : ""}`}
            aria-current={section === "settings" ? "page" : undefined}
            onClick={() => setSection("settings")}
          >
            <StaffIcon name="settings" />
            <span>
              {t(
                "Настройки и безопасность",
                "Баптаулар және қауіпсіздік",
                "Settings & security",
              )}
            </span>
          </button>
          <div className="staff-sidebar-utilities">
            <ThemeToggle />
            <button
              className="staff-signout"
              onClick={() => {
                void staffRequest("auth/logout", {})
                  .then(() => location.replace("/admin/login"))
                  .catch((reason) => setError(errorText(reason, locale)));
              }}
            >
              <StaffIcon name="logout" />
              {t("Выйти", "Шығу", "Sign out")}
            </button>
          </div>
        </div>
      </aside>
      <main className="staff-content">
        <header className="staff-heading">
          <div>
            <p className="staff-muted">
              {t(
                "Администрирование платформы",
                "Платформаны басқару",
                "Platform administration",
              )}
            </p>
            <h1>
              {section === "settings"
                ? t(
                    "Настройки и безопасность",
                    "Баптаулар және қауіпсіздік",
                    "Settings & security",
                  )
                : nav.find((item) => item.id === section)?.label}
            </h1>
          </div>
          <div className="staff-languages">
            {[
              ["ru", "RU"],
              ["kk", "KZ"],
              ["en", "EN"],
            ].map(([lang, label]) => (
              <a
                key={lang}
                aria-current={locale === lang ? "true" : undefined}
                href={`/admin?lang=${lang}`}
              >
                {label}
              </a>
            ))}
          </div>
        </header>
        {error ? (
          <p role="alert" className="staff-error">
            {error}
          </p>
        ) : null}
        {section === "support" ? (
          <StaffSupportInbox
            staff={staff}
            initialCaseId={caseId}
            onConsumed={() => setCaseId(null)}
            openOrder={(id) => {
              setOrderId(id);
              setSection("orders");
            }}
          />
        ) : section === "users" ? (
          <StaffPeople staff={staff} openCase={openCase} />
        ) : section === "events" ? (
          <StaffEvents />
        ) : section === "orders" ? (
          <StaffOrders
            staff={staff}
            initialId={orderId}
            onConsumed={() => setOrderId(null)}
          />
        ) : section === "finance" ? (
          <StaffFinance />
        ) : section === "audit" ? (
          <StaffActivity />
        ) : (
          <StaffSettings staff={staff} />
        )}
      </main>
    </div>
  );
}
