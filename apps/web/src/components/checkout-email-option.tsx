"use client";

import type { CheckoutEmailChoice, LinkedMethodsResponse, VerificationGrantResponse, VerificationRequestResponse } from "@event-platform/shared-types";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { apiRequest } from "../app/(auth)/_lib/api";
import { quickRequest } from "../app/quick/api";
import { useLocale } from "./locale-provider";
import { CHECKOUT_COPY } from "../lib/checkout-copy";

export function CheckoutEmailOption({ quickToken, choice, onChoice, onVerified, onEnabledChange }: { quickToken?: string; choice: CheckoutEmailChoice | null; onChoice: (choice: CheckoutEmailChoice | null) => void; onVerified?: () => void; onEnabledChange?: (enabled: boolean) => void }) {
  const copy = CHECKOUT_COPY[useLocale()];
  const sequence = useRef(0);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(null);
  const [address, setAddress] = useState(choice?.address ?? "");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"address" | "code" | "verified">(choice ? "verified" : "address");
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(Boolean(choice));

  useEffect(() => {
    if (choice) { setEnabled(true); setAddress(choice.address); setStage("verified"); }
  }, [choice?.address, choice?.grant]);

  useEffect(() => {
    if (quickToken) return;
    let active = true;
    void apiRequest<LinkedMethodsResponse>("/me/identities").then(methods => { if (active) setLinkedEmail(methods.email.address); }).catch(() => undefined);
    return () => { active = false; };
  }, [quickToken]);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [retryAt]);

  function reset(nextAddress = "") {
    sequence.current++; setAddress(nextAddress); setChallengeId(""); setCode(""); setStage("address"); setRetryAt(0); setRemaining(0); setBusy(false); setError(null); onChoice(null);
  }

  async function requestCode() {
    const ticket = ++sequence.current;
    setBusy(true); setError(null);
    try {
      const result = quickToken
        ? await quickRequest<VerificationRequestResponse>("email/request-code", quickToken, { address })
        : await apiRequest<VerificationRequestResponse>("/me/checkouts/email/request-code", { method: "POST", body: JSON.stringify({ address }) });
      if (ticket !== sequence.current) return;
      setChallengeId(result.challengeId); setCode(""); setStage("code"); setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    } catch (reason) { if (ticket === sequence.current) setError(readError(reason, copy.emailFailed)); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (stage === "address") { await requestCode(); return; }
    const ticket = ++sequence.current;
    setBusy(true); setError(null);
    try {
      if (quickToken) {
        const result = await quickRequest<{ verified: true; email: string }>("email/verify-code", quickToken, { address, challengeId, code });
        if (ticket !== sequence.current) return;
        onChoice({ address: result.email }); onVerified?.();
      } else {
        const result = await apiRequest<VerificationGrantResponse>("/me/checkouts/email/verify-code", { method: "POST", body: JSON.stringify({ address, challengeId, code }) });
        if (ticket !== sequence.current) return;
        onChoice({ address, grant: result.grant });
      }
      setStage("verified");
    } catch (reason) { if (ticket === sequence.current) setError(readError(reason, copy.emailFailed)); }
    finally { if (ticket === sequence.current) setBusy(false); }
  }

  return <section className="mt-4 rounded-xl border border-[#dce2f3] dark:border-ticket-border p-4 text-sm">
    <label className="flex items-start gap-3 font-semibold"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); onEnabledChange?.(event.target.checked); if (!event.target.checked) reset(); else if (linkedEmail) { setAddress(linkedEmail); setStage("verified"); onChoice({ address: linkedEmail }); } }} />{copy.emailTickets}</label>
    {enabled ? <div className="mt-3">
      {linkedEmail && !quickToken ? <button type="button" className="mb-3 text-sm font-semibold text-[#5b21b6] dark:text-ticket-accent underline" onClick={() => { if (choice?.address === linkedEmail) reset(); else { sequence.current++; setAddress(linkedEmail); setStage("verified"); setError(null); onChoice({ address: linkedEmail }); } }}>{choice?.address === linkedEmail ? `${copy.verifiedEmail}: ${linkedEmail}. ${copy.useOther}` : `${copy.useVerified} ${linkedEmail}`}</button> : null}
      {stage === "verified" && choice ? <p role="status" className="text-emerald-800 dark:text-ticket-success">{choice.address}: {copy.willSend}</p> : <form className="grid gap-3" onSubmit={verify}>
        {stage === "address" ? <label className="grid gap-2 font-semibold">{copy.recipientEmail}<input className={inputClass} required type="email" autoComplete="email" value={address} onChange={event => { sequence.current++; setAddress(event.target.value); onChoice(null); }} placeholder="name@example.com" /></label> : <><p>{copy.codeSent} {mask(address)} <button type="button" className="font-semibold text-[#5b21b6] dark:text-ticket-accent underline" onClick={() => reset()}>{copy.change}</button></p><label className="grid gap-2 font-semibold">{copy.verificationCode}<input className={inputClass} required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} /></label><button type="button" disabled={busy || remaining > 0} className="justify-self-start font-semibold text-[#5b21b6] dark:text-ticket-accent disabled:opacity-50" onClick={() => void requestCode()}>{remaining > 0 ? `${copy.resendIn} ${remaining} s` : copy.resend}</button></>}
        <button type="submit" disabled={busy} className="justify-self-start rounded-xl bg-[#5b21b6] dark:bg-ticket-primary px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? copy.wait : stage === "address" ? copy.getCode : copy.confirmEmail}</button>
      </form>}
      {error ? <p role="alert" className="mt-3 text-red-700 dark:text-ticket-danger">{error}</p> : null}
    </div> : null}
  </section>;
}

const inputClass = "w-full rounded-xl border border-[#d2cadc] dark:border-ticket-border px-4 py-3 font-normal outline-none focus:border-[#713dcc] dark:focus:border-ticket-accent focus:ring-2 focus:ring-[#e4d7fa] dark:focus:ring-ticket-border";
function mask(value: string): string { const [local, domain] = value.split("@"); return domain ? `${(local ?? "").slice(0, 1)}***@${domain}` : value; }
function readError(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
