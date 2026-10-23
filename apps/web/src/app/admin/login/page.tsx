"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StaffSessionView } from "@event-platform/shared-types";
import { useLocale } from "../../../components/locale-provider";
import { staffRequest, setStaffCsrf, errorText } from "../staff-client";
export default function StaffLogin() {
  const locale = useLocale(),
    ru = locale === "ru",
    kk = locale === "kk";
  const [step, setStep] = useState<
      "password" | "otp" | "enroll" | "recover" | "accept" | "reset" | "codes"
    >("password"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [enrollment, setEnrollment] = useState<{
      qr: string;
      secret: string;
    } | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const token = useRef("");
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const invite = fragment.get("invite"),
      reset = fragment.get("reset");
    if (invite || reset) {
      token.current = invite ?? reset!;
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      setStep(invite ? "accept" : "reset");
      return;
    }
    void staffRequest<StaffSessionView>("auth/session")
      .then((value) => {
        setStaffCsrf(value.csrf);
        if (value.authenticated) location.replace("/admin");
        else setStep(value.staff.mfaEnrolled ? "otp" : "enroll");
      })
      .catch(() => {});
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (step === "password") {
        const value = await staffRequest<StaffSessionView>("auth/login", {
          email,
          password,
        });
        setPassword("");
        setStaffCsrf(value.csrf);
        setStep(value.staff.mfaEnrolled ? "otp" : "enroll");
      } else if (step === "recover") {
        await staffRequest("auth/recover", { email });
        setMessage(
          ru
            ? "Если аккаунт существует, письмо отправлено."
            : kk
              ? "Аккаунт болса, хат жіберілді."
              : "If the account exists, an email has been sent.",
        );
      } else if (step === "accept" || step === "reset") {
        await staffRequest(`auth/${step}`, { token: token.current, password });
        token.current = "";
        setPassword("");
        setStep("password");
        setMessage(
          ru
            ? "Пароль сохранён. Войдите в аккаунт."
            : kk
              ? "Құпиясөз сақталды. Аккаунтқа кіріңіз."
              : "Password saved. Sign in to continue.",
        );
      } else {
        const value = await staffRequest<
          StaffSessionView & { recoveryCodes: string[] }
        >("auth/mfa/verify", { code });
        setStaffCsrf(value.csrf);
        setCode("");
        if (value.recoveryCodes.length) {
          setCodes(value.recoveryCodes);
          setStep("codes");
        } else location.replace("/admin");
      }
    } catch (reason) {
      setError(errorText(reason, locale));
    } finally {
      setBusy(false);
    }
  }
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      setEnrollment(await staffRequest("auth/mfa/enroll", {}));
    } catch (reason) {
      setError(errorText(reason, locale));
    } finally {
      setBusy(false);
    }
  }
  const title =
    step === "codes"
      ? ru
        ? "Сохраните коды восстановления"
        : kk
          ? "Қалпына келтіру кодтарын сақтаңыз"
          : "Save your recovery codes"
      : step === "otp" || step === "enroll"
        ? ru
          ? "Подтверждение входа"
          : kk
            ? "Кіруді растау"
            : "Verify your sign-in"
        : step === "recover"
          ? ru
            ? "Восстановление доступа"
            : kk
              ? "Қолжетімділікті қалпына келтіру"
              : "Recover access"
          : step === "accept" || step === "reset"
            ? ru
              ? "Создайте пароль"
              : kk
                ? "Құпиясөз жасаңыз"
                : "Create your password"
            : ru
              ? "Вход для сотрудников"
              : kk
                ? "Қызметкерлерге кіру"
                : "Staff sign-in";
  return (
    <main className="staff-login">
      <section className="staff-card">
        <p className="staff-brand">
          TICKET <span>Admin</span>
        </p>
        <h1>{title}</h1>
        {error ? (
          <p className="staff-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {step === "codes" ? (
          <>
            <p>
              {ru
                ? "Коды показываются один раз. Каждый код заменяет код приложения при входе и используется однократно."
                : kk
                  ? "Кодтар бір рет көрсетіледі. Әр код бір рет қолданылады."
                  : "These are shown once. Each code can replace an authenticator code once."}
            </p>
            <div className="staff-recovery">
              {codes.map((value) => (
                <code key={value}>{value}</code>
              ))}
            </div>
            <button
              className="staff-primary"
              onClick={() => location.replace("/admin")}
            >
              {ru
                ? "Коды сохранены — продолжить"
                : kk
                  ? "Кодтар сақталды — жалғастыру"
                  : "I saved the codes — continue"}
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            {["password", "recover"].includes(step) ? (
              <label>
                Email
                <input
                  required
                  autoComplete="username"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : null}
            {["password", "accept", "reset"].includes(step) ? (
              <label>
                {ru ? "Пароль" : kk ? "Құпиясөз" : "Password"}
                <input
                  required
                  minLength={step === "password" ? undefined : 12}
                  maxLength={1024}
                  autoComplete={
                    step === "password" ? "current-password" : "new-password"
                  }
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            ) : null}
            {step === "enroll" ? (
              <>
                <p>
                  {ru
                    ? "Добавьте TICKET Admin в приложение-аутентификатор, затем введите шестизначный код."
                    : kk
                      ? "TICKET Admin-ді аутентификаторға қосып, алты таңбалы кодты енгізіңіз."
                      : "Add TICKET Admin to your authenticator app, then enter its six-digit code."}
                </p>
                {enrollment ? (
                  <>
                    <img
                      src={enrollment.qr}
                      alt={ru ? "QR для аутентификатора" : "Authenticator QR"}
                    />
                    <code className="staff-secret">{enrollment.secret}</code>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void enroll()}
                  >
                    {ru
                      ? "Настроить двухфакторный вход"
                      : kk
                        ? "Екі факторлы кіруді орнату"
                        : "Set up two-factor authentication"}
                  </button>
                )}
              </>
            ) : null}
            {step === "otp" || step === "enroll" ? (
              <label>
                {ru
                  ? "Код приложения или восстановления"
                  : kk
                    ? "Қолданба не қалпына келтіру коды"
                    : "Authenticator or recovery code"}
                <input
                  required
                  autoComplete="one-time-code"
                  value={code}
                  maxLength={40}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            ) : null}
            <button
              className="staff-primary"
              disabled={busy || (step === "enroll" && !enrollment)}
            >
              {busy ? "…" : ru ? "Продолжить" : kk ? "Жалғастыру" : "Continue"}
            </button>
            {step === "password" ? (
              <button
                type="button"
                className="staff-link"
                onClick={() => {
                  setStep("recover");
                  setError("");
                }}
              >
                {ru
                  ? "Забыли пароль?"
                  : kk
                    ? "Құпиясөзді ұмыттыңыз ба?"
                    : "Forgot password?"}
              </button>
            ) : null}
            {step === "recover" ? (
              <button
                type="button"
                className="staff-link"
                onClick={() => setStep("password")}
              >
                {ru
                  ? "Вернуться ко входу"
                  : kk
                    ? "Кіруге оралу"
                    : "Back to sign-in"}
              </button>
            ) : null}
          </form>
        )}
        <p className="staff-muted">
          {ru
            ? "Регистрация сотрудников по приглашению модератора."
            : kk
              ? "Тіркелу модератордың шақыруымен қолжетімді."
              : "Staff registration requires a moderator invitation."}
        </p>
      </section>
    </main>
  );
}
