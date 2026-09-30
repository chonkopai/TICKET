"use client";

import type { LinkedMethodsResponse, LoginContactMethod, TelegramLinkTokenResponse, VerificationGrantResponse, VerificationRequestResponse } from "@event-platform/shared-types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { apiRequest } from "../_lib/api";
import { clearSession } from "../_lib/session";
import { useLocale } from "../../../components/locale-provider";
import { localeUrl } from "../../../lib/locale";
import { LOGIN_METHODS_COPY } from "../../../lib/login-methods-copy";

const PENDING_TELEGRAM_KEY = "event-platform:pending-telegram-identity";
type Step = "idle" | "code" | "complete";

export function LoginMethodsPanel({ onUpdated }: { onUpdated: () => void }) {
  const locale = useLocale();
  const copy = LOGIN_METHODS_COPY[locale];
  const router = useRouter();
  const sequence = useRef(0);
  const [methods, setMethods] = useState<LinkedMethodsResponse | null>(null);
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
    let active = true;
    apiRequest<LinkedMethodsResponse>("/me/identities").then(result => { if (active) setMethods(result); }).catch(error => { if (active) setMessage(readError(error, copy.failed)); });
    const pending = window.sessionStorage.getItem(PENDING_TELEGRAM_KEY);
    if (pending) setTelegramToken(pending);
    return () => { active = false; };
  }, [copy]);

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
  }, [telegramToken, telegramState, onUpdated, copy]);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)));
    tick(); const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [retryAt]);

  function reset(nextMethod = method) {
    sequence.current++;
    setMethod(nextMethod); setTarget(""); setStep("idle"); setCode(""); setChallengeId(""); setGrant(""); setPassword(""); setRetryAt(0); setRemaining(0); setMessage(null); setBusy(false);
  }

  async function requestCode(resend = false) {
    if (method === "phone") return;
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
    event.preventDefault(); if (busy || method === "phone") return;
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
        setMethods(updated); reset(method); setMessage(copy.methodLinked); onUpdated();
      }
    } catch (error) { if (ticket === sequence.current) setMessage(readError(error, copy.failed)); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }

  async function startTelegram() {
    setBusy(true); setMessage(null);
    try {
      const link = await apiRequest<TelegramLinkTokenResponse>("/auth/telegram/link-token", { method: "POST" });
      window.sessionStorage.setItem(PENDING_TELEGRAM_KEY, link.token);
      setTelegramToken(link.token); setTelegramState("waiting");
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

  return <section className="mt-5 rounded-2xl border border-[#ded8e7] bg-white p-6">
    <h2 className="text-xl font-bold">{copy.title}</h2>
    <p className="mt-2 text-sm text-[#665d70]">{copy.intro}</p>
    {methods ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><Status label="Telegram" value={methods.telegram.linked ? copy.linked : copy.unlinked} /><Status label="Email" value={methods.email.address ?? copy.unlinked} /><Status label={copy.phone} value={methods.phone.number ?? copy.unlinked} /></div> : <p className="mt-4 text-sm text-[#665d70]">{copy.loading}</p>}
    {methods && (!methods.email.linked || !methods.phone.linked) ? <div className="mt-6 border-t border-[#ece7f1] pt-6">
      <h3 className="font-bold">{copy.connectContact}</h3>
      <div className="mt-3 flex gap-2" role="group" aria-label={copy.contactGroup}>{(["email", "phone"] as const).filter(item => !methods[item].linked).map(item => <button key={item} type="button" aria-pressed={method === item} onClick={() => reset(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${method === item ? "bg-[#5b21b6] text-white" : "border border-[#d2cadc]"}`}>{item === "email" ? "Email" : copy.phone}</button>)}</div>
      {method === "phone" ? <p className="mt-3 text-sm text-amber-900">{copy.smsUnavailable}</p> : null}
      <form className="mt-4 grid max-w-lg gap-3" onSubmit={submitLink}>
        {step === "idle" ? <label className="grid gap-2 text-sm font-semibold">{method === "email" ? copy.emailAddress : copy.intlPhone}<input required className={fieldClass} type={method === "email" ? "email" : "tel"} autoComplete={method === "email" ? "email" : "tel"} value={target} onChange={event => { sequence.current++; setTarget(event.target.value); }} disabled={method === "phone"} placeholder={method === "phone" ? "+77011234567" : "name@example.com"} /></label> : <div className="flex justify-between gap-3 text-sm"><span className="break-all">{maskTarget(target, method)}</span><button type="button" onClick={() => reset(method)} className="font-semibold text-[#5b21b6]">{copy.change}</button></div>}
        {step === "code" ? <><label className="grid gap-2 text-sm font-semibold">{copy.code}<input required className={fieldClass} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label><button type="button" disabled={busy || remaining > 0} className="justify-self-start text-sm font-semibold text-[#5b21b6] disabled:opacity-50" onClick={() => void requestCode(true)}>{remaining > 0 ? `${copy.resendIn} ${remaining} s` : copy.resend}</button></> : null}
        {step === "complete" && !methods.passwordSet ? <label className="grid gap-2 text-sm font-semibold">{copy.setPassword}<input required className={fieldClass} type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /><span className="text-xs font-normal text-[#665d70]">{copy.minPassword}</span></label> : null}
        <button type="submit" disabled={busy || method === "phone"} className="rounded-xl bg-[#5b21b6] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? copy.wait : step === "idle" ? copy.getCode : step === "code" ? copy.confirmCode : copy.connect}</button>
      </form>
    </div> : null}
    {methods && !methods.telegram.linked ? <div className="mt-6 border-t border-[#ece7f1] pt-6"><h3 className="font-bold">{copy.connectTelegram}</h3><p className="mt-2 text-sm text-[#665d70]">{copy.telegramHint}</p><button type="button" disabled={busy} className="mt-3 rounded-xl border border-[#5b21b6] px-4 py-2 font-bold text-[#5b21b6] disabled:opacity-50" onClick={() => void startTelegram()}>{copy.openTelegram}</button>{telegramState === "waiting" ? <p className="mt-3 text-sm">{copy.telegramWaiting}</p> : null}{telegramState === "ready" ? <button type="button" disabled={busy} className="mt-3 ml-2 rounded-xl bg-[#5b21b6] px-4 py-2 font-bold text-white disabled:opacity-50" onClick={() => void confirmTelegram()}>{copy.confirmTelegram}</button> : null}{telegramState === "expired" ? <p className="mt-3 text-sm text-red-700">{copy.telegramExpired}</p> : null}</div> : null}
    {methods?.passwordSet ? <form className="mt-6 grid max-w-lg gap-3 border-t border-[#ece7f1] pt-6" onSubmit={changePassword}><h3 className="font-bold">{copy.changePassword}</h3><label className="grid gap-2 text-sm font-semibold">{copy.currentPassword}<input required className={fieldClass} type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label className="grid gap-2 text-sm font-semibold">{copy.newPassword}<input required className={fieldClass} type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><p className="text-xs text-[#665d70]">{copy.passwordHint}</p><button disabled={busy} type="submit" className="rounded-xl border border-[#5b21b6] px-5 py-3 font-bold text-[#5b21b6] disabled:opacity-50">{copy.submitPassword}</button></form> : null}
    {message ? <p role="status" aria-live="polite" className="mt-5 rounded-xl bg-[#f2edff] p-3 text-sm text-[#3b176f]">{message}</p> : null}
  </section>;
}

function Status({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-[#f7f4fb] p-4"><p className="text-xs font-semibold text-[#665d70]">{label}</p><p className="mt-1 break-all font-bold">{value}</p></div>; }
const fieldClass = "w-full rounded-xl border border-[#d2cadc] bg-white px-4 py-3 font-normal outline-none focus:border-[#713dcc] focus:ring-2 focus:ring-[#e4d7fa]";
function readError(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function maskTarget(target: string, method: LoginContactMethod): string {
  if (method === "email") { const [local, domain] = target.split("@"); return domain ? `${(local ?? "").slice(0, 1)}***@${domain}` : target; }
  return `${target.slice(0, 3)}***${target.slice(-4)}`;
}
