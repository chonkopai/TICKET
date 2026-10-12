"use client";

import type { LinkedMethodsResponse, LoginContactMethod, TelegramLinkTokenResponse, VerificationGrantResponse, VerificationRequestResponse } from "@event-platform/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { GoogleLoginButton } from "../_components/google-login-button";
import { apiRequest } from "../_lib/api";
import { clearSession } from "../_lib/session";
import { useLocale } from "../../../components/locale-provider";
import { localeUrl } from "../../../lib/locale";
import { AccountIcon } from "../../../components/account-icon";
import { ACCOUNT_REDESIGN_COPY } from "../../../lib/account-redesign-copy";
import { ACCOUNT_EXPERIENCE_COPY } from "../../../lib/account-experience-copy";
import { LOGIN_METHODS_COPY } from "../../../lib/login-methods-copy";

const PENDING_TELEGRAM_KEY = "event-platform:pending-telegram-identity";
type Step = "idle" | "code" | "complete";

export function LoginMethodsPanel({ methods, onMethodsChange: setMethods, onUpdated }: { methods: LinkedMethodsResponse | null; onMethodsChange: (methods: LinkedMethodsResponse) => void; onUpdated: () => void }) {
  const locale = useLocale();
  const copy = LOGIN_METHODS_COPY[locale];
  const design = ACCOUNT_REDESIGN_COPY[locale];
  const experience = ACCOUNT_EXPERIENCE_COPY[locale];
  const verificationId = useId();
  const [showContact, setShowContact] = useState(false);
  const contactForm = useRef<HTMLFormElement>(null);
  const contactTriggers = useRef<Record<LoginContactMethod, HTMLButtonElement | null>>({ email: null, phone: null });
  const [showGoogle, setShowGoogle] = useState(false);
  const router = useRouter();
  const sequence = useRef(0);
  const [method, setMethod] = useState<LoginContactMethod>("email");
  const [step, setStep] = useState<Step>("idle");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [grant, setGrant] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const [telegramState, setTelegramState] = useState<"waiting" | "ready" | "linked" | "expired" | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const pending = window.sessionStorage.getItem(PENDING_TELEGRAM_KEY);
    if (pending) setTelegramToken(pending);
  }, []);

  useEffect(() => {
    if (!telegramToken) return;
    let active = true;
    const check = async () => {
      try {
        const result = await apiRequest<{ state: "waiting" | "ready" | "linked" | "expired" }>("/me/identities/telegram/status", { method: "POST", body: JSON.stringify({ token: telegramToken }) });
        if (!active) return;
        setTelegramState(result.state);
        if (result.state === "linked" || result.state === "expired") {
          window.sessionStorage.removeItem(PENDING_TELEGRAM_KEY);
          if (result.state === "linked") { setTelegramToken(null); setMethods(await apiRequest<LinkedMethodsResponse>("/me/identities")); onUpdated(); }
        }
      } catch (error) { if (active) setMessage(readError(error, copy.failed)); }
    };
    void check();
    const timer = setInterval(() => { if (document.visibilityState === "visible" && (telegramState === null || telegramState === "waiting")) void check(); }, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [telegramToken, telegramState, onUpdated, setMethods, copy]);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)));
    tick(); const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (showContact) contactForm.current?.querySelector("input")?.focus();
  }, [showContact, method, step]);

  function closeContact() {
    reset(); setShowContact(false); contactTriggers.current[method]?.focus();
  }

  function selectContact(next: LoginContactMethod) {
    reset(next); setShowGoogle(false); setShowContact(true);
  }

  function reset(nextMethod = method) {
    sequence.current++;
    setMethod(nextMethod); setTarget(""); setStep("idle"); setCode(""); setChallengeId(""); setGrant(""); setPassword(""); setRetryAt(0); setRemaining(0); setMessage(null); setBusy(false);
  }

  async function requestCode(resend = false) {
    const ticket = ++sequence.current;
    setBusy(true); setMessage(null);
    try {
      const response = await apiRequest<VerificationRequestResponse>("/me/identities/request-code", { method: "POST", body: JSON.stringify({ method, target }) });
      if (ticket !== sequence.current) return;
      setChallengeId(response.challengeId); setCode(""); setStep("code"); setRetryAt(Date.now() + response.retryAfterSeconds * 1_000);
      setMessage(resend ? copy.codeResent : copy.codeSent);
    } catch (error) { if (ticket === sequence.current) setMessage(readError(error, copy.failed)); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (step === "idle") { await requestCode(); return; }
    const ticket = ++sequence.current;
    setBusy(true); setMessage(null);
    try {
      if (step === "code") {
        const proof = await apiRequest<VerificationGrantResponse>("/me/identities/verify-code", { method: "POST", body: JSON.stringify({ method, target, challengeId, code }) });
        if (ticket !== sequence.current) return;
        setGrant(proof.grant); setStep("complete"); setMessage(copy.contactVerified);
      } else {
        const updated = await apiRequest<LinkedMethodsResponse>("/me/identities/complete", { method: "POST", body: JSON.stringify({ method, target, grant, ...(!methods?.passwordSet ? { password } : {}) }) });
        if (ticket !== sequence.current) return;
        setMethods(updated); reset(method); setShowContact(false); setMessage(copy.methodLinked); onUpdated();
      }
    } catch (error) { if (ticket === sequence.current) setMessage(readError(error, copy.failed)); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }

  async function startTelegram() {
    setBusy(true); setMessage(null);
    try {
      const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", { method: "POST" });
      window.sessionStorage.setItem(PENDING_TELEGRAM_KEY, link.token);
      setTelegramToken(link.token); setTelegramState("waiting"); setBusy(false);
      window.location.assign(link.deepLinkUrl);
    } catch (error) { setMessage(readError(error, copy.failed)); setBusy(false); }
  }

  async function confirmTelegram() {
    if (!telegramToken) return;
    setBusy(true); setMessage(null);
    try {
      const updated = await apiRequest<LinkedMethodsResponse>("/me/identities/telegram/confirm", { method: "POST", body: JSON.stringify({ token: telegramToken }) });
      setMethods(updated); setTelegramState("linked"); window.sessionStorage.removeItem(PENDING_TELEGRAM_KEY); onUpdated(); setMessage(copy.telegramLinked);
    } catch (error) { setMessage(readError(error, copy.failed)); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await apiRequest<{ changed: true }>("/me/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      clearSession(); router.replace(localeUrl("/login", locale));
    } catch (error) { setMessage(readError(error, copy.failed)); setBusy(false); }
  }

  return <section className="account-card account-methods">
    <div><h2>{copy.title}</h2><p className="account-subtitle">{copy.intro}</p></div>
    {methods ? <div className="account-method-grid">
      {(["email", "phone"] as const).map(item => {
        const linked = methods[item].linked;
        const value = item === "email" ? methods.email.address : methods.phone.number;
        return <button className={`account-method account-method-contact ${showContact && method === item ? "is-active" : ""}`} key={item} ref={element => { contactTriggers.current[item] = element; }} type="button" aria-expanded={showContact && method === item} aria-controls={verificationId} onClick={() => { if (showContact && method === item) { reset(item); setShowContact(false); } else selectContact(item); }}><span className="account-method-title"><AccountIcon name={item === "email" ? "mail" : "smartphone"} />{item === "email" ? "Email" : copy.phone}</span><span className="account-method-value">{value ?? copy.unlinked}</span>{linked ? <span className="account-connected"><AccountIcon name="circle-check" />{copy.linked}</span> : <span className="account-text-link">{item === "email" ? copy.connectContact : design.connectPhone}<AccountIcon name="arrow-right" /></span>}</button>;
      })}
      <div className="account-method"><h3><AccountIcon name="send" />Telegram</h3><p>{methods.telegram.linked ? copy.linked : copy.unlinked}</p>{!methods.telegram.linked ? <button className="account-text-link" disabled={busy} type="button" onClick={() => { reset(); setShowContact(false); setShowGoogle(false); void startTelegram(); }}>{design.connectTelegram}<AccountIcon name="arrow-right" /></button> : null}</div>
      <div className="account-method"><h3>Google</h3><p>{methods.google?.linked ? methods.google.email ?? copy.linked : copy.unlinked}</p>{!methods.google?.linked ? <button className="account-text-link" type="button" onClick={() => { reset(); setShowContact(false); setShowGoogle(value => !value); }}>{design.connectGoogle}<AccountIcon name="arrow-right" /></button> : null}</div>
    </div> : <p className="account-muted" role="status">{copy.loading}</p>}
    {showGoogle ? <div className="account-method-extra">{process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? <GoogleLoginButton link onLinked={() => { void apiRequest<LinkedMethodsResponse>("/me/identities").then(setMethods).catch(error => setMessage(readError(error, copy.failed))); onUpdated(); }} /> : <p role="status">{design.googleUnavailable}</p>}</div> : null}
    {methods && showContact ? <div className="account-verification" id={verificationId}>
      {methods[method].linked ? <div className="account-linked-detail"><h3>{method === "email" ? "Email" : copy.phone}</h3><p className="account-connected"><AccountIcon name="circle-check" />{copy.linked}</p><p className="account-muted">{method === "email" ? methods.email.address : methods.phone.number}</p><p className="account-muted">{experience.sharedPassword}</p><button type="button" className="account-text-link" onClick={closeContact}>{experience.close}</button></div> : <form onSubmit={submitLink} ref={contactForm}><div className="account-card-toolbar"><h3>{method === "email" ? copy.emailAddress : copy.intlPhone}</h3><button type="button" className="account-text-link" onClick={closeContact}>{experience.close}</button></div>
        {step === "idle" ? <label className="account-field">{method === "email" ? copy.emailAddress : copy.intlPhone}<input required className="account-input" type={method === "email" ? "email" : "tel"} autoComplete={method === "email" ? "email" : "tel"} value={target} onChange={event => { sequence.current++; setTarget(event.target.value); }} disabled={busy} placeholder={method === "phone" ? "+77011234567" : "name@example.com"} /></label> : <div className="account-card-toolbar"><span className="account-muted">{maskTarget(target, method)}</span><button type="button" onClick={() => reset(method)} className="account-text-link">{copy.change}</button></div>}
        {step === "code" ? <><label className="account-field">{copy.code}<input required className="account-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label><button type="button" disabled={busy || remaining > 0} className="account-text-link" onClick={() => void requestCode(true)}>{remaining > 0 ? `${copy.resendIn} ${remaining} s` : copy.resend}</button></> : null}
        {step === "complete" && !methods.passwordSet ? <label className="account-field">{copy.setPassword}<input required className="account-input" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /><span className="account-muted">{copy.minPassword}</span></label> : null}
        <button type="submit" disabled={busy} className="account-button account-button-primary">{busy ? copy.wait : step === "idle" ? copy.getCode : step === "code" ? copy.confirmCode : copy.connect}</button>
      </form>}
      {!methods[method].linked ? <div className="account-verification-guidance"><h3><AccountIcon name="shield-check" />{design.confirmation}</h3><p>{method === "email" ? experience.emailVerification : experience.phoneVerification}</p><p>{experience.sharedPassword}</p></div> : null}
    </div> : null}
    {telegramState ? <div className="account-method-extra">{telegramState === "waiting" ? <p role="status">{copy.telegramWaiting}</p> : null}{telegramState === "ready" ? <><p>{copy.telegramHint}</p><button type="button" disabled={busy} className="account-button account-button-primary" onClick={() => void confirmTelegram()}>{copy.confirmTelegram}</button></> : null}{telegramState === "expired" ? <><p>{copy.telegramExpired}</p><button className="account-button" type="button" disabled={busy} onClick={() => void startTelegram()}>{copy.openTelegram}</button></> : null}</div> : null}
    {methods?.passwordSet ? <details className="account-method-extra"><summary className="account-text-link">{copy.changePassword}</summary><form onSubmit={changePassword}><label className="account-field">{copy.currentPassword}<input required className="account-input" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label className="account-field">{copy.newPassword}<input required className="account-input" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><p>{experience.sharedPassword}</p><p>{copy.passwordHint}</p><button disabled={busy} type="submit" className="account-button">{copy.submitPassword}</button></form></details> : null}
    {message ? <p role="status" className="account-message">{message}</p> : null}
  </section>;
}

function readError(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function maskTarget(target: string, method: LoginContactMethod): string {
  if (method === "email") { const [local, domain] = target.split("@"); return domain ? `${(local ?? "").slice(0, 1)}***@${domain}` : target; }
  return `${target.slice(0, 3)}***${target.slice(-4)}`;
}
