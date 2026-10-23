"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  PrivateFile,
  VerificationView,
} from "@event-platform/shared-types";
import { OrganizerWorkspaceShell } from "../../../components/organizer-workspace";
import {
  PlatformSupport,
  SupportFile,
  SupportStatus,
  supportRequest,
  useSupportText,
} from "../../../components/platform-support";
import { VerifiedOrganizerBadge } from "../../../components/verified-organizer-badge";
import { COUNTRY_CODES, countryName } from "../../../lib/countries";
import { useLocale } from "../../../components/locale-provider";
export default function VerificationPage() {
  return (
    <OrganizerWorkspaceShell active="verification">
      <VerificationForm />
    </OrganizerWorkspaceShell>
  );
}
function VerificationForm() {
  const t = useSupportText(),
    locale = useLocale(),
    [rows, setRows] = useState<VerificationView[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [legalName, setName] = useState(""),
    [entityType, setEntity] = useState("ip"),
    [entityTypeDetails, setEntityDetails] = useState(""),
    [countryCode, setCountry] = useState("KZ"),
    [registrationId, setIdentifier] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [files, setFiles] = useState<PrivateFile[]>([]),
    [editing, setEditing] = useState(false),
    [caseId, setCase] = useState<string | null>(null);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setRows(await supportRequest<VerificationView[]>("verification"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  function edit() {
    const row = rows?.[0];
    if (row) {
      setName(row.legalName);
      setEntity(row.entityType);
      setEntityDetails(row.entityTypeDetails ?? "");
      setCountry(row.countryCode);
      setIdentifier(row.registrationId);
      setEmail(row.email);
      setPhone(row.phone);
    }
    setEditing(true);
  }
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
        const body = new FormData();
        body.set("file", file);
        const result = await supportRequest<PrivateFile>("uploads", {
          method: "POST",
          body,
        });
        setFiles((values) => [...values, result]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await supportRequest("verification", {
        method: "POST",
        body: JSON.stringify({
          legalName,
          entityType,
          ...(entityType === "other" ? { entityTypeDetails: entityTypeDetails.trim() } : {}),
          countryCode,
          registrationId,
          email,
          phone,
          fileIds: files.map((v) => v.id),
        }),
      });
      setEditing(false);
      setFiles([]);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const current = rows?.[0],
    status = current?.status ?? "not_submitted";
  return (
    <>
      <div className="account-heading">
        <h1>
          {t(
            "Проверка организатора",
            "Ұйымдастырушыны тексеру",
            "Organizer verification",
          )}
        </h1>
        <p>
          {t(
            "Отправьте данные и документы модератору TICKET. После проверки рядом с именем появится отметка.",
            "Деректер мен құжаттарды TICKET модераторына жіберіңіз. Тексергеннен кейін атыңыздың жанында белгі пайда болады.",
            "Submit your business details and documents to a TICKET moderator. Approval adds a badge beside your name.",
          )}
        </p>
      </div>
      <section className="account-card verification-card">
        <div className="account-card-toolbar">
          <h2>
            {t("Статус заявки", "Өтініш күйі", "Application status")}
            <VerifiedOrganizerBadge verified={status === "verified"} />
          </h2>
          <SupportStatus status={status} />
        </div>
        {error ? (
          <p role="alert" className="support-error">
            {error}
          </p>
        ) : null}
        {rows === null ? (
          <p role="status">{t("Загрузка…", "Жүктелуде…", "Loading…")}</p>
        ) : null}
        {current?.reviewReason ? <p>{current.reviewReason}</p> : null}
        {current ? (
          <button
            type="button"
            className="account-button"
            onClick={() => setCase(current.caseId)}
          >
            {t(
              "Обсудить с поддержкой",
              "Қолдаумен талқылау",
              "Discuss with support",
            )}
          </button>
        ) : null}
        {rows && rows.length > 0 && status !== "pending" && !editing ? (
          <button
            type="button"
            className="account-button account-button-primary"
            onClick={edit}
          >
            {status === "verified"
              ? t(
                  "Изменить данные и пройти повторную проверку",
                  "Деректерді өзгертіп қайта тексеру",
                  "Update details and request another review",
                )
              : t("Подать заявку", "Өтініш беру", "Submit application")}
          </button>
        ) : null}
        {editing || rows?.length === 0 ? (
          <form
            className="support-verification"
            onSubmit={(e) => void submit(e)}
          >
            <fieldset disabled={busy}>
              <label className="account-field full">
                {t(
                  "Юридическое название / ФИО предпринимателя",
                  "Заңды атауы / кәсіпкердің аты-жөні",
                  "Legal business name / proprietor name",
                )}
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={legalName}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="account-field">
                {t("Тип организации", "Ұйым түрі", "Entity type")}
                <select
                  value={entityType}
                  onChange={(e) => setEntity(e.target.value)}
                >
                  <option value="ip">{t("ИП", "ЖК", "Sole proprietor")}</option>
                  <option value="ooo">
                    {t("ООО", "ЖШС", "Limited company")}
                  </option>
                  <option value="other">{t("Другое", "Басқа", "Other")}</option>
                </select>
              </label>
              <label className="account-field">
                {t(
                  "Страна регистрации",
                  "Тіркелген ел",
                  "Registration country",
                )}
                <select
                  value={countryCode}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {countryName(code, locale)}
                    </option>
                  ))}
                </select>
              </label>
              {entityType === "other" ? <label className="account-field full">
                {t("Укажите тип организации", "Ұйым түрін көрсетіңіз", "Specify your entity type")}
                <input required minLength={2} maxLength={120} value={entityTypeDetails} onChange={e => setEntityDetails(e.target.value)} placeholder={t("Например, некоммерческая организация", "Мысалы, коммерциялық емес ұйым", "For example, nonprofit organization")} />
              </label> : null}
              <label className="account-field full">
                {t(
                  "Регистрационный / налоговый номер",
                  "Тіркеу / салық нөмірі",
                  "Business registration / tax identifier",
                )}
                <input
                  required
                  maxLength={120}
                  value={registrationId}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                <small>
                  {t(
                    "Укажите номер, применимый в стране регистрации.",
                    "Тіркелген елде қолданылатын нөмірді көрсетіңіз.",
                    "Use the identifier applicable in your registration country.",
                  )}
                </small>
              </label>
              <label className="account-field">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="account-field">
                {t("Телефон", "Телефон", "Phone")}
                <input
                  type="tel"
                  required
                  minLength={3}
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="account-field full">
                {t(
                  "Документы · PDF, JPEG, PNG · до 10 МБ · от 1 до 5 файлов",
                  "Құжаттар · PDF, JPEG, PNG · 10 МБ дейін · 1–5 файл",
                  "Documents · PDF, JPEG, PNG · up to 10 MB · 1–5 files",
                )}
                <input
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
                      setFiles((values) =>
                        values.filter((v) => v.id !== file.id),
                      )
                    }
                  >
                    {" "}
                    ×
                  </button>
                </div>
              ))}
            </fieldset>
            <p>
              {t(
                "Документы доступны только вам и модераторам. Новая заявка снимает прежнюю отметку до повторной проверки.",
                "Құжаттар тек сізге және модераторларға қолжетімді. Жаңа өтініш бұрынғы белгіні қайта тексеруге дейін алып тастайды.",
                "Only you and moderators can access these documents. A new submission removes the previous badge until reviewed.",
              )}
            </p>
            <div className="support-actions">
              <button
                className="account-button account-button-primary"
                disabled={busy || files.length === 0}
              >
                {busy
                  ? t("Отправка…", "Жіберілуде…", "Submitting…")
                  : t(
                      "Отправить на проверку",
                      "Тексеруге жіберу",
                      "Submit for review",
                    )}
              </button>
              {current ? (
                <button
                  type="button"
                  className="account-button"
                  onClick={() => setEditing(false)}
                >
                  {t("Отмена", "Бас тарту", "Cancel")}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </section>
      {caseId ? <PlatformSupport initialCaseId={caseId} /> : null}
      {rows?.length ? (
        <section className="account-card">
          <h2>
            {t("История заявок", "Өтініштер тарихы", "Submission history")}
          </h2>
          {rows.map((row) => (
            <article className="support-verification-history" key={row.id}>
              <strong>
                #{row.version} · {row.legalName}
              </strong>{" "}
              <SupportStatus status={row.status} />
              <p>
                {new Date(row.createdAt).toLocaleString()} · {row.reviewReason}
              </p>
              {row.documents.map((file) => (
                <div key={file.id}>
                  <SupportFile file={file} onError={setError} />
                </div>
              ))}
              <button
                type="button"
                className="account-text-link"
                onClick={() => setCase(row.caseId)}
              >
                {t("Переписка", "Хаттар", "Conversation")}
              </button>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
