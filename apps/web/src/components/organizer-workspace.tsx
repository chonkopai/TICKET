"use client";

import type { AuthUser, OrganizerDashboard, OrganizerProfile } from "@event-platform/shared-types";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ProtectedRoute } from "../app/(auth)/_components/protected-route";
import { logoutSession } from "../app/(auth)/_lib/api";
import { getSession } from "../app/(auth)/_lib/session";
import { useAccountResource } from "../app/(auth)/account/use-account-resource";
import { ORGANIZER_EVENTS_COPY } from "../lib/organizer-events-copy";
import { ORGANIZER_WORKSPACE_COPY } from "../lib/organizer-workspace-copy";
import { localeUrl } from "../lib/locale";
import { AccountIcon } from "./account-icon";
import { useLocale } from "./locale-provider";

type WorkspaceState = {
  profile: ReturnType<typeof useAccountResource<OrganizerProfile>>;
  dashboard: ReturnType<typeof useAccountResource<OrganizerDashboard>>;
  user: AuthUser | null;
};
const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useOrganizerWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Organizer workspace provider is required");
  return value;
}

export function OrganizerWorkspaceShell({ active, children }: { active: "events" | "profile"; children: ReactNode }) {
  return <main className="account-workspace organizer-workspace"><ProtectedRoute><Workspace active={active}>{children}</Workspace></ProtectedRoute></main>;
}

function Workspace({ active, children }: { active: "events" | "profile"; children: ReactNode }) {
  const locale = useLocale(); const copy = ORGANIZER_WORKSPACE_COPY[locale];
  const profile = useAccountResource<OrganizerProfile>("/me/organizer-profile", false);
  const dashboard = useAccountResource<OrganizerDashboard>("/api/organizer/events/dashboard/summary");
  const [user, setUser] = useState<AuthUser | null>(() => getSession()?.user ?? null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const help = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const refresh = () => setUser(getSession()?.user ?? null);
    window.addEventListener("event-platform:session-changed", refresh);
    return () => window.removeEventListener("event-platform:session-changed", refresh);
  }, []);
  async function logout() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await logoutSession(); window.location.assign(localeUrl("/", locale)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : ORGANIZER_EVENTS_COPY[locale].loadFailed); setBusy(false); }
  }
  const name = profile.data?.organizationName || user?.name || ORGANIZER_EVENTS_COPY[locale].organizer;
  const complete = Boolean(profile.data?.email && profile.data?.phone);
  return <WorkspaceContext value={{ profile, dashboard, user }}><div className="account-layout organizer-layout">
    <aside className="account-sidebar organizer-sidebar">
      <div className="account-identity"><OrganizerAvatar name={name} photoUrl={profile.data?.photoUrl ?? user?.photoUrl ?? null} /><div className="account-identity-details"><p className="account-name">{name}</p><p className="account-role">{ORGANIZER_EVENTS_COPY[locale].organizer}</p></div></div>
      <nav className="account-navigation organizer-navigation" aria-label={copy.sections}><p className="organizer-eyebrow">{copy.sections}</p>
        <Link className={active === "events" ? "is-active" : ""} aria-current={active === "events" ? "page" : undefined} href={localeUrl("/organizer/events", locale)}><OrganizerIcon name="calendar-days" /><span>{copy.events}</span><span className="organizer-nav-count">{dashboard.data?.totalEvents ?? "…"}</span></Link>
        <Link className={active === "profile" ? "is-active" : ""} aria-current={active === "profile" ? "page" : undefined} href={localeUrl("/organizer/profile", locale)}><AccountIcon name="user-round" /><span>{copy.profile}</span></Link>
      </nav>
      {profile.data ? <div className="account-organizer organizer-contact-status"><h2>{complete ? copy.complete : copy.incomplete}</h2><p>{complete ? copy.completeHint : copy.contactHint}</p><Link className="account-text-link" href={localeUrl("/organizer/profile", locale)}>{complete ? copy.profile : copy.fillProfile}<AccountIcon name="arrow-right" /></Link></div> : profile.error ? <OrganizerResourceError message={profile.error} onRetry={profile.retry} /> : <p className="account-muted" role="status">{ORGANIZER_EVENTS_COPY[locale].loading}</p>}
      <Link className="account-text-link organizer-guest-link" href={localeUrl("/account?tab=profile", locale)}>{copy.guest}<AccountIcon name="arrow-up-right" /></Link>
      <div className="account-utilities"><button type="button" onClick={() => help.current?.showModal()}><AccountIcon name="circle-help" />{copy.help}</button><button type="button" disabled={busy} onClick={() => void logout()}><AccountIcon name="log-out" />{copy.logout}</button><p>© {new Date().getFullYear()} TICKET</p></div>
    </aside>
    <div className="account-content organizer-content">{error ? <OrganizerResourceError message={error} /> : null}{children}</div>
    <dialog className="account-support account-card" aria-labelledby="organizer-help-title" ref={help}><div className="account-card-toolbar"><h2 id="organizer-help-title">{copy.help}</h2><button className="account-button" type="button" onClick={() => help.current?.close()}>{copy.close}</button></div><p>{copy.helpHint}</p><div className="account-support-actions"><Link className="account-button account-button-primary" href={localeUrl("/organizer/events", locale)} onClick={() => help.current?.close()}>{copy.events}</Link><Link className="account-text-link" href={localeUrl("/organizer/profile", locale)} onClick={() => help.current?.close()}>{copy.profile}</Link></div></dialog>
  </div></WorkspaceContext>;
}

export function OrganizerAvatar({ name, photoUrl, className = "" }: { name: string; photoUrl: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  const source = photoUrl ? new URL(photoUrl, process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").toString() : null;
  return <span aria-hidden="true" className={`account-avatar ${className}`}>{source && !failed ? <img alt="" src={source} onError={() => setFailed(true)} /> : name.slice(0, 1).toUpperCase() || "O"}</span>;
}

/** Existing event-creation SVGs retain their shapes and intrinsic dimensions. */
export function OrganizerIcon({ name }: { name: string }) {
  if (["calendar-days", "upload", "lock-keyhole"].includes(name)) return <img aria-hidden="true" alt="" className="organizer-existing-icon" src={`/event-creation/${name}.svg`} />;
  return <AccountIcon name={name} />;
}

export function OrganizerResourceError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const copy = ORGANIZER_WORKSPACE_COPY[useLocale()];
  return <div className="organizer-resource-error" role="alert"><p>{message}</p>{onRetry ? <button className="account-text-link" type="button" onClick={onRetry}>{copy.retry}</button> : null}</div>;
}
