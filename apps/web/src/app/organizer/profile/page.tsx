"use client";

import type { OrganizerProfile } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { OrganizerAvatar, OrganizerIcon, OrganizerResourceError, OrganizerWorkspaceShell, useOrganizerWorkspace } from "../../../components/organizer-workspace";
import { useLocale } from "../../../components/locale-provider";
import { localeUrl } from "../../../lib/locale";
import { ORGANIZER_PROFILE_COPY } from "../../../lib/organizer-profile-copy";
import { ORGANIZER_WORKSPACE_COPY } from "../../../lib/organizer-workspace-copy";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession, updateSessionUser } from "../../(auth)/_lib/session";

export default function OrganizerProfilePage() {
  return <OrganizerWorkspaceShell active="profile"><ProfileForm /></OrganizerWorkspaceShell>;
}

function ProfileForm() {
  const locale = useLocale(); const copy = ORGANIZER_PROFILE_COPY[locale]; const design = ORGANIZER_WORKSPACE_COPY[locale];
  const { profile, dashboard } = useOrganizerWorkspace();
  const [draft, setDraft] = useState<OrganizerProfile | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false); const mutationLock = useRef(false);
  useEffect(() => { if (profile.data) setDraft(current => current ?? profile.data); }, [profile.data]);
  function edit(key: keyof OrganizerProfile, value: string | boolean) {
    setSuccess(""); setDraft(current => current ? { ...current, [key]: value } : current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || mutationLock.current) return;
    mutationLock.current = true; setSaving(true); setError(""); setSuccess("");
    try {
      const updated = await apiRequest<OrganizerProfile>("/me/organizer-profile", { method: "PATCH", body: JSON.stringify({
        organizationName: draft.organizationName.trim(), name: draft.name?.trim(), email: draft.email?.trim() || null,
        phone: draft.phone?.trim() || null, address: draft.address?.trim() || null, showContactInfo: draft.showContactInfo,
      }) });
      profile.setData(updated); setDraft(updated);
      const session = getSession();
      if (session) updateSessionUser({ ...session.user, name: updated.name, email: updated.email, phone: updated.phone, photoUrl: updated.photoUrl });
      setSuccess(copy.saved);
    } catch (reason) { setError(message(reason, copy.failed)); }
    finally { mutationLock.current = false; setSaving(false); }
  }
  async function upload(file: File | undefined) {
    if (!file || mutationLock.current) return;
    setError(""); setSuccess("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError(design.photoInvalid); return; }
    mutationLock.current = true; setUploading(true);
    try {
      const body = new FormData(); body.set("photo", file);
      const result = await apiRequest<{ photoUrl: string }>("/me/organizer-profile/photo", { method: "POST", body });
      // Photo is persisted separately. Preserve unsaved text fields in the draft.
      profile.setData(current => current ? { ...current, photoUrl: result.photoUrl } : current);
      setDraft(current => current ? { ...current, photoUrl: result.photoUrl } : current);
      const session = getSession();
      if (session) updateSessionUser({ ...session.user, photoUrl: result.photoUrl });
      setSuccess(copy.photoUpdated);
    } catch (reason) { setError(message(reason, copy.failed)); }
    finally { mutationLock.current = false; setUploading(false); }
  }
  const busy = saving || uploading;
  return <>
    <div className="account-heading"><p>{design.workspace}</p><h1>{copy.title}</h1><p>{design.profileHint}</p></div>
    {profile.error ? <OrganizerResourceError message={profile.error} onRetry={profile.retry} /> : null}
    {dashboard.error ? <OrganizerResourceError message={dashboard.error} onRetry={dashboard.retry} /> : null}
    {error ? <OrganizerResourceError message={error} /> : null}
    {success ? <p className="organizer-success" role="status">{success}</p> : null}
    {!draft ? profile.error ? null : <p className="account-loading" role="status">{copy.loadingProfile}</p> : <div className="organizer-profile-columns">
      <form className="organizer-profile-form" onSubmit={event => void save(event)}>
        <fieldset disabled={busy} className="organizer-profile-fields">
          <section className="account-card organizer-form-section"><div><h2>{design.basic}</h2><p className="account-subtitle">{design.basicHint}</p></div>
            <div className="organizer-photo-upload"><OrganizerAvatar name={draft.organizationName} photoUrl={draft.photoUrl} className="organizer-profile-avatar" /><div><label className="account-button organizer-upload-label"><OrganizerIcon name="upload" />{uploading ? copy.uploading : copy.upload}<input aria-label={copy.upload} className="sr-only" accept="image/jpeg,image/png,image/webp" type="file" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label><p>{copy.photoHint}</p><p>{design.photoImmediate}</p></div></div>
            <Field id="organizationName" label={copy.organization} required maxLength={160} value={draft.organizationName} hint={design.alwaysVisible} onChange={value => edit("organizationName", value)} />
            <Field id="name" label={copy.name} required maxLength={120} value={draft.name ?? ""} onChange={value => edit("name", value)} />
          </section>
          <section className="account-card organizer-form-section"><div><h2>{design.contacts}</h2><p className="account-subtitle">{design.contactsHint}</p></div><div className="account-fields">
            <Field id="email" label={copy.email} type="email" maxLength={320} value={draft.email ?? ""} onChange={value => edit("email", value)} />
            <Field id="phone" label={copy.phone} type="tel" maxLength={32} pattern={String.raw`\+?[0-9\(\) .\-]{3,32}`} value={draft.phone ?? ""} onChange={value => edit("phone", value)} />
          </div><Field id="address" label={copy.address} maxLength={300} value={draft.address ?? ""} onChange={value => edit("address", value)} />
            <label className="organizer-visibility-toggle"><input checked={draft.showContactInfo} type="checkbox" onChange={event => edit("showContactInfo", event.target.checked)} /><span><strong>{copy.showContacts}</strong><small>{copy.showHint}</small></span></label>
          </section>
        </fieldset>
        <div className="account-form-actions"><button className="account-button account-button-primary" disabled={busy} type="submit">{saving ? copy.saving : copy.save}</button><Link className="account-button" href={localeUrl("/organizer/events", locale)}>{copy.cancel}</Link></div>
      </form>
      <aside className="organizer-profile-guidance"><section className="account-card organizer-visibility-preview"><OrganizerIcon name="eye" /><h2>{design.visibilityTitle}</h2><p className="organizer-preview-note">{design.previewHint}</p><div><h3>{copy.organization}</h3><p className="organizer-visible-status">{design.always}</p><p>{draft.organizationName || design.noValue}</p></div><div><h3>{design.contactVisibility}</h3><p className={draft.showContactInfo ? "organizer-visible-status" : "account-muted"} role="status">{draft.showContactInfo ? design.visible : design.hidden}</p>{draft.showContactInfo ? <div className="organizer-public-preview"><OrganizerAvatar name={draft.name || draft.organizationName} photoUrl={draft.photoUrl} /><dl>{([[copy.name, draft.name], [copy.email, draft.email], [copy.phone, draft.phone], [copy.address, draft.address]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || design.noValue}</dd></div>)}</dl></div> : <p>{design.hiddenHint}</p>}</div></section>
        <section className="organizer-login-guidance"><OrganizerIcon name="lock-keyhole" /><h2>{design.loginTitle}</h2><p>{design.loginHint}</p><Link className="account-text-link" href={localeUrl("/account?tab=profile", locale)}>{design.guest}<OrganizerIcon name="arrow-up-right" /></Link></section>
        <Link className="account-text-link" href={localeUrl("/organizer/events", locale)}><span aria-hidden="true">←</span>{design.back}</Link>
      </aside>
    </div>}
  </>;
}

function Field({ id, label, value, onChange, type = "text", required = false, maxLength, hint, pattern }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; maxLength: number; hint?: string; pattern?: string }) {
  return <div><label className="account-field" htmlFor={`organizer-${id}`}>{label}<input id={`organizer-${id}`} aria-describedby={hint ? `organizer-${id}-hint` : undefined} maxLength={maxLength} onChange={event => onChange(event.target.value)} required={required} pattern={pattern} type={type} value={value} /></label>{hint ? <p id={`organizer-${id}-hint`} className="organizer-field-hint">{hint}</p> : null}</div>;
}
function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
