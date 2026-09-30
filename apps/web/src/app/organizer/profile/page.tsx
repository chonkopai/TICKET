"use client";

import type { OrganizerProfile } from "@event-platform/shared-types";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { ProtectedRoute } from "../../(auth)/_components/protected-route";
import { apiRequest } from "../../(auth)/_lib/api";
import { getSession, updateSessionUser } from "../../(auth)/_lib/session";
import { PageShell } from "../../../components/ui";
import { useLocale } from "../../../components/locale-provider";
import { localeUrl } from "../../../lib/locale";
import { ORGANIZER_PROFILE_COPY } from "../../../lib/organizer-profile-copy";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function OrganizerProfilePage() {
  return <PageShell className="max-w-3xl"><ProtectedRoute><ProfileForm /></ProtectedRoute></PageShell>;
}

function ProfileForm() {
  const locale = useLocale();
  const copy = ORGANIZER_PROFILE_COPY[locale];
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { void apiRequest<OrganizerProfile>("/me/organizer-profile").then(setProfile).catch((reason: unknown) => setError(message(reason, copy.failed))); }, [copy]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const updated = await apiRequest<OrganizerProfile>("/me/organizer-profile", { method: "PATCH", body: JSON.stringify({
        organizationName: profile.organizationName, name: profile.name, email: profile.email || null,
        phone: profile.phone || null, address: profile.address || null, showContactInfo: profile.showContactInfo,
      }) });
      setProfile(updated);
      const session = getSession();
      if (session) updateSessionUser({ ...session.user, name: updated.name, photoUrl: updated.photoUrl });
      setSuccess(copy.saved);
    } catch (reason) { setError(message(reason, copy.failed)); }
    finally { setSaving(false); }
  }

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true); setError(""); setSuccess("");
    try {
      const body = new FormData(); body.set("photo", file);
      const result = await apiRequest<{ photoUrl: string }>("/me/organizer-profile/photo", { method: "POST", body });
      setProfile((current) => current ? { ...current, photoUrl: result.photoUrl } : current);
      const session = getSession();
      if (session) updateSessionUser({ ...session.user, photoUrl: result.photoUrl });
      setSuccess(copy.photoUpdated);
    } catch (reason) { setError(message(reason, copy.failed)); }
    finally { setUploading(false); }
  }

  return <main className="py-8 sm:py-12">
    <Link className="text-sm font-semibold text-[#5b21b6] hover:underline" href={localeUrl("/organizer/events", locale)}>← {copy.back}</Link>
    <h1 className="mt-5 text-3xl font-bold">{copy.title}</h1>
    <p className="mt-2 text-sm text-[#665d70]">{copy.description}</p>
    {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}<button className="ml-3 font-semibold underline" onClick={() => { setError(""); void apiRequest<OrganizerProfile>("/me/organizer-profile").then(setProfile).catch((reason: unknown) => setError(message(reason, copy.failed))); }} type="button">{copy.retry}</button></div> : null}
    {success ? <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-800" role="status">{success}</p> : null}
    {!profile ? <p className="mt-8">{copy.loadingProfile}</p> : <form className="mt-6 space-y-5 rounded-2xl border border-[#e2ddea] bg-white p-6 shadow-sm sm:p-8" onSubmit={(event) => void save(event)}>
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[#eee5fb] text-3xl font-bold text-[#5b21b6]">{profile.photoUrl ? <img alt={copy.photoAlt} className="h-full w-full object-cover" src={new URL(profile.photoUrl, API_URL).toString()} /> : profile.organizationName.slice(0, 1).toUpperCase()}</div>
        <label className="cursor-pointer rounded-xl border border-[#cfc3de] px-4 py-2 text-sm font-semibold text-[#5b21b6] hover:bg-[#f7f2ff]">{uploading ? copy.uploading : copy.upload}<input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} type="file" /></label>
        <span className="text-xs text-[#665d70]">{copy.photoHint}</span>
      </div>
      <Field label={copy.organization} required value={profile.organizationName} onChange={(value) => setProfile({ ...profile, organizationName: value })} />
      <Field label={copy.name} required value={profile.name ?? ""} onChange={(value) => setProfile({ ...profile, name: value })} />
      <div className="grid gap-5 sm:grid-cols-2"><Field label={copy.email} type="email" value={profile.email ?? ""} onChange={(value) => setProfile({ ...profile, email: value })} /><Field label={copy.phone} type="tel" value={profile.phone ?? ""} onChange={(value) => setProfile({ ...profile, phone: value })} /></div>
      <Field label={copy.address} value={profile.address ?? ""} onChange={(value) => setProfile({ ...profile, address: value })} />
      <label className="flex items-start gap-3 rounded-xl bg-[#f7f2ff] p-4"><input checked={profile.showContactInfo} className="mt-1 h-4 w-4 accent-[#5b21b6]" onChange={(event) => setProfile({ ...profile, showContactInfo: event.target.checked })} type="checkbox" /><span><strong className="block">{copy.showContacts}</strong><span className="mt-1 block text-sm text-[#665d70]">{copy.showHint}</span></span></label>
      <div className="flex flex-wrap gap-3 pt-2"><button className="rounded-xl bg-[#5b21b6] px-6 py-3 font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? copy.saving : copy.save}</button><Link className="rounded-xl border border-[#d2cadc] px-6 py-3 font-semibold" href={localeUrl("/organizer/events", locale)}>{copy.cancel}</Link></div>
    </form>}
  </main>;
}

function Field({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-sm font-semibold">{label}<input className="mt-2 block w-full rounded-xl border border-[#d2cadc] px-4 py-3 font-normal outline-none focus:border-[#5b21b6]" maxLength={type === "email" ? 255 : 300} onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} /></label>;
}

function message(reason: unknown, fallback: string): string { return reason instanceof Error ? reason.message : fallback; }
