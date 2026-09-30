"use client";

import { type AuthResponse, type LoginContactMethod, type VerificationGrantResponse, type VerificationRequestResponse } from "@event-platform/shared-types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { TelegramLoginButton } from "../_components/telegram-login-button";
import { publicAuthRequest, safeReturnPath } from "../_lib/public-auth";
import { saveSession } from "../_lib/session";
import { useLocale } from "../../../components/locale-provider";
import { AUTH_COPY } from "./auth-copy";

type Mode = "login" | "register" | "reset";
type Step = "contact" | "code" | "details";
type SocialProvider = "google" | "apple";

export function LoginClient() {
  const locale = useLocale();
  const copy = AUTH_COPY[locale];
  const router = useRouter();
  const sequence = useRef(0);
  const [method, setMethod] = useState<LoginContactMethod>("email");
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("contact");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [grant, setGrant] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [navigationQuery, setNavigationQuery] = useState("");

  useEffect(() => {
    setNavigationQuery(window.location.search.slice(1));
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function resetFlow(nextMethod = method, nextMode = mode) {
    sequence.current++;
    if (nextMethod !== method) setTarget("");
    setMethod(nextMethod);
    setMode(nextMode);
    setStep("contact");
    setCode("");
    setChallengeId("");
    setGrant("");
    setPassword("");
    setShowPassword(false);
    setMessage(null);
    setBusy(false);
    setRetryAt(0);
    setSecondsLeft(0);
  }

  function updateTarget(value: string) {
    sequence.current++;
    setTarget(value);
    setStep("contact");
    setCode("");
    setChallengeId("");
    setGrant("");
    setRetryAt(0);
    setSecondsLeft(0);
    setBusy(false);
    setMessage(null);
  }

  async function requestCode(resend = false): Promise<void> {
    // SMS OTP is deliberately inert until the provider issue is resolved.
    if (method !== "email" || mode === "login" || busy) return;
    const ticket = ++sequence.current;
    setBusy(true);
    setMessage(null);
    try {
      const path = mode === "register" ? "/auth/register/request-code" : "/auth/password/reset/request-code";
      const response = await publicAuthRequest<VerificationRequestResponse>(path, { method, target });
      if (ticket !== sequence.current) return;
      setChallengeId(response.challengeId);
      setCode("");
      setStep("code");
      setRetryAt(Date.now() + response.retryAfterSeconds * 1000);
      setMessage(resend ? copy.sentAgain : copy.sent);
    } catch (error) {
      if (ticket === sequence.current) setMessage(errorMessage(error, copy.requestFailed));
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || (method === "phone" && mode !== "login")) return;
    if (mode !== "login" && step === "contact") {
      await requestCode();
      return;
    }

    const ticket = ++sequence.current;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") {
        const response = await publicAuthRequest<AuthResponse>("/auth/password/login", { method, target, password });
        if (ticket !== sequence.current) return;
        saveSession(response);
        router.replace(safeReturnPath());
      } else if (step === "code") {
        const path = mode === "register" ? "/auth/register/verify-code" : "/auth/password/reset/verify-code";
        const response = await publicAuthRequest<VerificationGrantResponse>(path, { method, target, challengeId, code });
        if (ticket !== sequence.current) return;
        setGrant(response.grant);
        setStep("details");
        setMessage(copy.verified);
      } else if (mode === "register") {
        const response = await publicAuthRequest<AuthResponse>("/auth/register/complete", { method, target, grant, firstName, lastName, password });
        if (ticket !== sequence.current) return;
        saveSession(response);
        router.replace(safeReturnPath());
      } else {
        await publicAuthRequest<{ reset: true }>("/auth/password/reset/complete", { method, target, grant, newPassword: password });
        if (ticket !== sequence.current) return;
        resetFlow(method, "login");
        setMessage(copy.resetDone);
      }
    } catch (error) {
      if (ticket === sequence.current) setMessage(errorMessage(error, copy.requestFailed));
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }

  const catalogHref = navigationQuery ? "/?" + navigationQuery : "/";
  const title = mode === "register" ? copy.registerTitle : mode === "reset" ? copy.resetTitle : copy.loginTitle;
  const smsUnavailable = method === "phone" && mode !== "login";
  const contactLabel = method === "email" ? copy.emailAddress : copy.phoneNumber;

  return (
    <main className="ticket-auth min-h-svh bg-white lg:grid lg:grid-cols-2 xl:grid-cols-[7fr_5fr]">
      <HeroPanel catalogHref={catalogHref} />
      <section className="flex min-h-svh flex-col justify-between bg-white px-5 py-6 text-[#0b1c30] sm:px-10 sm:py-8 xl:px-12" aria-label={copy.authRegion}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-3 sm:py-5">
          <Link className="mb-5 flex w-fit items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee] lg:hidden" href={catalogHref} aria-label={copy.catalog}><TicketIcon className="h-7 w-7 text-[#6320ee]" /><span className="ticket-auth-wordmark text-xl font-extrabold tracking-[-0.04em] text-[#6320ee]">TICKET</span></Link>
          <h1 className="mb-5 text-[26px] font-extrabold leading-tight tracking-[-0.035em] text-[#0b1c30] sm:text-3xl">{title}</h1>

          <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={copy.methods}>
            <ProviderButton provider="google" />
            <ProviderButton provider="apple" />
            <button
              aria-controls={telegramOpen ? "telegram-login-panel" : undefined}
              aria-expanded={telegramOpen}
              className={classes("flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[#0b1c30] shadow-sm transition hover:bg-[#e5eeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee] sm:flex-row sm:gap-2 sm:px-3", telegramOpen ? "border-[#6320ee] bg-[#eff4ff]" : "border-[#e5eeff] bg-[#eff4ff]")}
              onClick={() => setTelegramOpen((open) => !open)}
              type="button"
            >
              <TelegramIcon /><span className="text-xs font-semibold sm:text-sm">Telegram</span>
            </button>
          </div>

          <div className="relative my-5 flex items-center justify-center sm:my-6" aria-hidden="true">
            <span className="w-full border-t border-[#dce9ff]" />
            <span className="absolute whitespace-nowrap bg-white px-2.5 text-[9px] font-semibold tracking-[0.12em] text-[#7a7488] sm:px-3 sm:text-[11px]">{copy.divider}</span>
          </div>

          {telegramOpen ? (
            <section className="rounded-2xl border border-[#e5eeff] bg-[#f8faff] p-5 sm:p-6" id="telegram-login-panel" aria-label={copy.telegramTitle}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold">{copy.telegramTitle}</h2><p className="mt-1 text-sm leading-5 text-[#625d70]">{copy.telegramHint}</p></div>
                <button className="rounded-full p-1 text-[#625d70] hover:bg-[#e5eeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee]" onClick={() => setTelegramOpen(false)} type="button" aria-label={copy.telegramClose}><CloseIcon /></button>
              </div>
              <TelegramLoginButton />
              <button className="mt-4 text-sm font-semibold text-[#4a00c1] underline underline-offset-2" onClick={() => setTelegramOpen(false)} type="button">{copy.telegramReturn}</button>
            </section>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#eff4ff] p-1" role="group" aria-label={copy.methodLabel}>
                {(["email", "phone"] as const).map((item) => (
                  <button aria-pressed={method === item} className={classes("flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee]", method === item ? "bg-white text-[#4a00c1] shadow-sm" : "text-[#494456] hover:text-[#0b1c30]")} key={item} onClick={() => resetFlow(item, mode)} type="button">
                    {item === "email" ? <MailIcon /> : <PhoneIcon />}{item === "email" ? "Email" : copy.phone}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 border-b border-[#dce9ff]" role="group" aria-label={copy.actionLabel}>
                {(["login", "register", "reset"] as const).map((item) => (
                  <button aria-pressed={mode === item} className={classes("min-h-12 border-b-2 px-1 py-2 text-center text-[11px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6320ee] sm:text-sm", mode === item ? "border-[#6320ee] text-[#4a00c1]" : "border-transparent text-[#494456] hover:text-[#0b1c30]")} key={item} onClick={() => resetFlow(method, item)} type="button">
                    {item === "login" ? copy.login : item === "register" ? copy.register : copy.forgot}
                  </button>
                ))}
              </div>

              {smsUnavailable ? (
                <div className="mt-5 space-y-4">
                  <ContactField method={method} label={contactLabel} target={target} onChange={updateTarget} />
                  <div className="rounded-xl border border-[#e8def6] bg-[#f8f4ff] p-3.5 text-sm leading-5 text-[#51485c]" role="note">{copy.smsUnavailable}</div>
                  <button className={submitClass} disabled type="button">{copy.smsSoon}</button>
                </div>
              ) : (
                <form className="mt-5 grid gap-4" onSubmit={submit}>
                  {step === "contact" || mode === "login" ? (
                    <ContactField method={method} label={contactLabel} target={target} onChange={updateTarget} />
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-[#eff4ff] px-3.5 py-3 text-sm">
                      <span className="min-w-0 break-all text-[#494456]">{step === "details" ? copy.verifiedAddress : copy.codeSentTo}: {maskDestination(target, method)}</span>
                      <button className="shrink-0 font-semibold text-[#4a00c1] underline underline-offset-2" onClick={() => resetFlow(method, mode)} type="button">{copy.change}</button>
                    </div>
                  )}

                  {mode !== "login" && step === "code" ? (
                    <>
                      <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b1c30]" htmlFor="verification-code">
                        {copy.mailCode}
                        <input autoComplete="one-time-code" className={fieldClass} id="verification-code" inputMode="numeric" maxLength={6} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setMessage(null); }} pattern="[0-9]{6}" required type="text" value={code} />
                      </label>
                      <button className="justify-self-start text-sm font-semibold text-[#4a00c1] underline underline-offset-2 disabled:text-[#938b9e]" disabled={busy || secondsLeft > 0} onClick={() => void requestCode(true)} type="button">
                        {secondsLeft > 0 ? `${copy.resendIn} ${secondsLeft} ${locale === "en" ? "s" : "с"}` : copy.resend}
                      </button>
                    </>
                  ) : null}

                  {mode === "register" && step === "details" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField id="first-name" label={copy.firstName} autoComplete="given-name" maxLength={100} value={firstName} onChange={setFirstName} disabled={busy} />
                      <TextField id="last-name" label={copy.lastName} autoComplete="family-name" maxLength={100} value={lastName} onChange={setLastName} disabled={busy} />
                    </div>
                  ) : null}

                  {mode === "login" || step === "details" ? (
                    <PasswordField mode={mode} password={password} showPassword={showPassword} busy={busy} onChange={(value) => { setPassword(value); setMessage(null); }} onToggle={() => setShowPassword((value) => !value)} />
                  ) : null}

                  <button className={submitClass} disabled={busy || (mode !== "login" && step === "contact" && method === "phone")} type="submit">
                    <span>{busy ? copy.wait : submitLabel(mode, step, copy)}</span>{busy ? <SpinnerIcon /> : <ArrowRightIcon />}
                  </button>
                </form>
              )}
            </>
          )}

          {message ? <p aria-live="polite" className="mt-4 rounded-xl bg-[#f2edff] px-3.5 py-3 text-sm leading-5 text-[#3b176f]" role="status">{message}</p> : null}
        </div>

        <footer className="w-full border-t border-[#dce9ff]/70 pt-5 text-center sm:pt-7">
          <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-[#7a7488]">{copy.legal}</p>
        </footer>
      </section>
    </main>
  );
}

function HeroPanel({ catalogHref }: { catalogHref: string }) {
  const copy = AUTH_COPY[useLocale()];
  return (
    <aside className="relative hidden min-h-svh flex-col justify-between overflow-hidden bg-[#080713] px-10 py-10 text-white lg:flex xl:px-14 xl:py-12" aria-label={copy.heroRegion}>
      <Image alt="" className="object-cover object-center" fill priority sizes="(min-width: 1280px) 58vw, 50vw" src="/auth/community-gathering.png" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,5,22,.9),rgba(8,7,26,.68)_55%,rgba(4,5,15,.28))]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,5,22,.42),transparent_38%,rgba(4,5,15,.92))]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_58%,rgba(99,32,238,.2),transparent_42%)]" />

      <div className="relative z-10 flex items-center">
        <Link className="flex items-center gap-2.5 text-white transition-opacity hover:opacity-85" href={catalogHref} aria-label={copy.catalog}>
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-[#6320ee]/85 shadow-lg"><TicketIcon className="h-6 w-6" /></span>
          <span className="ticket-auth-wordmark text-xl font-extrabold tracking-[-0.04em]">TICKET</span>
        </Link>
      </div>

      <div className="relative z-10 my-auto max-w-xl py-10">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300 backdrop-blur-md"><StarIcon />{copy.heroLabel}</span>
        <h2 className="mb-4 text-[clamp(2.25rem,3.45vw,3rem)] font-extrabold leading-[1.04] tracking-[-0.045em] text-white drop-shadow-md">{copy.heroTitle}</h2>
        <p className="max-w-lg text-base leading-[1.75] text-slate-200/90 xl:text-lg">{copy.heroDescription}</p>
      </div>

      <div className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/20 pt-5 xl:gap-6 xl:pt-6" aria-label={copy.heroRegion}>
        <HeroStep number="01" label={copy.heroCreate} />
        <HeroStep number="02" label={copy.heroFind} />
        <HeroStep number="03" label={copy.heroJoin} />
      </div>
    </aside>
  );
}

function HeroStep({ number, label }: { number: string; label: string }) {
  return <div className="min-w-0">
    <span className="text-[10px] font-semibold tracking-[0.18em] text-white/50">{number}</span>
    <div className="mt-1 text-sm font-semibold leading-snug text-white/90 xl:text-base">{label}</div>
  </div>;
}

function ProviderButton({ provider }: { provider: SocialProvider }) {
  const copy = AUTH_COPY[useLocale()];
  const label = provider === "google" ? "Google" : "Apple ID";
  return (
    <button aria-disabled="true" aria-label={label + ", " + copy.soon} className="relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-[#e5eeff] bg-[#eff4ff] px-1.5 py-2 text-[#0b1c30] shadow-sm transition hover:bg-[#e5eeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee] sm:flex-row sm:gap-2 sm:px-2" title={label + ": " + copy.soon} type="button">
      {provider === "google" ? <GoogleIcon /> : <AppleIcon />}
      <span className="text-xs font-semibold sm:text-sm">{label}</span>
      <span className="absolute right-1 top-1 rounded bg-white/80 px-1 py-0.5 text-[8px] leading-none text-[#625d70]">{copy.soon}</span>
    </button>
  );
}

function ContactField({ method, label, target, onChange }: { method: LoginContactMethod; label: string; target: string; onChange: (value: string) => void }) {
  const id = method === "email" ? "auth-email" : "auth-phone";
  return (
    <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b1c30]" htmlFor={id}>
      {label}
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#7a7488]">{method === "email" ? <MailIcon /> : <PhoneIcon />}</span>
        <input autoComplete={method === "email" ? "email" : "tel"} className={fieldClass + " pl-11"} id={id} onChange={(event) => onChange(event.target.value)} placeholder={method === "phone" ? "+7 (7__) ___-__-__" : "name@example.com"} required type={method === "email" ? "email" : "tel"} value={target} />
      </span>
    </label>
  );
}

function PasswordField({ mode, password, showPassword, busy, onChange, onToggle }: {
  mode: Mode; password: string; showPassword: boolean; busy: boolean; onChange: (value: string) => void; onToggle: () => void;
}) {
  const copy = AUTH_COPY[useLocale()];
  const label = mode === "reset" ? copy.newPassword : copy.password;
  return (
    <div className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b1c30]">
      <div className="flex items-center justify-between gap-2"><label htmlFor="auth-password">{label}</label>
        <button aria-label={showPassword ? copy.hidePassword : copy.showPassword} className="inline-flex items-center gap-1 text-[11px] font-semibold normal-case tracking-normal text-[#4a00c1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee]" onClick={onToggle} type="button"><EyeIcon />{showPassword ? copy.hide : copy.show}</button>
      </div>
      <span className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#7a7488]"><LockIcon /></span>
        <input autoComplete={mode === "login" ? "current-password" : "new-password"} className={fieldClass + " pl-11 pr-4"} disabled={busy} id="auth-password" maxLength={1024} minLength={mode === "login" ? undefined : 12} onChange={(event) => onChange(event.target.value)} placeholder={copy.passwordPlaceholder} required type={showPassword ? "text" : "password"} value={password} />
      </span>
      {mode !== "login" ? <span className="text-[11px] font-normal normal-case tracking-normal text-[#7a7488]">{copy.passwordMinimum}</span> : null}
    </div>
  );
}

function TextField({ id, label, autoComplete, maxLength, value, onChange, disabled }: {
  id: string; label: string; autoComplete: string; maxLength: number; value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  return <label className="grid gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0b1c30]" htmlFor={id}>
    {label}<input autoComplete={autoComplete} className={fieldClass} disabled={disabled} id={id} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} required type="text" value={value} />
  </label>;
}

const fieldClass = "min-h-12 w-full rounded-xl border border-transparent bg-[#eff4ff] px-4 py-3 text-sm font-normal normal-case tracking-normal text-[#0b1c30] outline-none transition placeholder:text-[#7a7488] hover:bg-[#eaf1ff] focus:border-[#6320ee] focus:bg-white focus:ring-2 focus:ring-[#6320ee]/15 disabled:opacity-60";
const submitClass = "mt-1 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6320ee] to-[#4a00c1] px-5 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[#6320ee]/25 transition hover:brightness-105 hover:shadow-xl hover:shadow-[#6320ee]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6320ee] focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:text-base";

function classes(...values: (string | false | undefined)[]) { return values.filter(Boolean).join(" "); }
function submitLabel(mode: Mode, step: Step, copy: typeof AUTH_COPY.ru) {
  if (mode === "login") return copy.submitLogin;
  if (step === "contact") return mode === "reset" ? copy.submitResetCode : copy.submitCode;
  if (step === "code") return copy.submitConfirm;
  return mode === "register" ? copy.submitRegister : copy.submitPassword;
}
function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function maskDestination(target: string, method: LoginContactMethod) {
  if (method === "email") {
    const [local, domain] = target.split("@");
    return domain ? (local ?? "").slice(0, 1) + "***@" + domain : target;
  }
  return target.slice(0, 3) + "***" + target.slice(-4);
}

function TicketIcon({ className = "" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24"><path d="M4 7a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4h16a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4H4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/><path d="M13 8.5v1m0 2v1m0 2v1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>;
}
function GoogleIcon() {
  return <svg aria-hidden="true" className="h-[19px] w-[19px] shrink-0" viewBox="0 0 24 24"><path d="M23.5 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.42-5.17 3.42-9.17Z" fill="#4285F4"/><path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24Z" fill="#34A853"/><path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" fill="#FBBC05"/><path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" fill="#EA4335"/></svg>;
}
function AppleIcon() {
  return <svg aria-hidden="true" className="h-[19px] w-[19px] shrink-0" viewBox="0 0 24 24"><path d="M16.67 12.93c.02 2.2 1.93 2.93 1.95 2.94-.02.05-.3 1.04-.98 2.07-.59.88-1.2 1.76-2.17 1.78-.95.02-1.26-.57-2.35-.57s-1.43.55-2.33.59c-.93.03-1.64-.96-2.24-1.83-1.22-1.77-2.15-5-.9-7.18.62-1.08 1.73-1.77 2.93-1.79.91-.02 1.76.61 2.32.61.55 0 1.59-.76 2.68-.65.46.02 1.76.18 2.59 1.4-.07.04-1.55.9-1.53 2.63ZM15.02 6.8c.49-.59.82-1.41.73-2.23-.71.03-1.57.47-2.08 1.06-.46.53-.86 1.37-.75 2.18.79.06 1.61-.4 2.1-1.01Z" fill="currentColor"/></svg>;
}
function TelegramIcon() {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-[#229ED9]" fill="none" viewBox="0 0 24 24"><path d="m21 4-3.2 16-6.3-5.3-3.7 3.5.5-5.8L18 6.3 7.1 11.1 3 9.8 21 4Z" fill="currentColor"/><path d="m8 12.4 10-6.1-6.5 8.4" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth=".8"/></svg>;
}
function MailIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24"><rect height="15" rx="2" stroke="currentColor" strokeWidth="1.8" width="20" x="2" y="4.5"/><path d="m3 6 9 7 9-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg>;
}
function PhoneIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" fill="none" viewBox="0 0 24 24"><path d="M7.1 3.5H4.5a1.5 1.5 0 0 0-1.5 1.6c.5 8.1 7 14.6 15.1 15.1a1.5 1.5 0 0 0 1.6-1.5v-2.6l-4-1-1.5 2a14.4 14.4 0 0 1-6.8-6.8l2-1.5-1-4.3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"/></svg>;
}
function ArrowRightIcon() {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>;
}
function EyeIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8"/></svg>;
}
function LockIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24"><rect height="10" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="11"/><path d="M8 11V7a4 4 0 1 1 8 0v4m-4 4v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>;
}
function StarIcon() {
  return <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6-4.4-4.3 6-.9L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8"/><path d="M12 8.5v5m-2.5-2.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4"/></svg>;
}
function CloseIcon() {
  return <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"/></svg>;
}
function SpinnerIcon() {
  return <svg aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="3"/></svg>;
}
