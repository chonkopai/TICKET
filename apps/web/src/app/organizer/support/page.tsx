"use client";
import { OrganizerWorkspaceShell } from "../../../components/organizer-workspace";
import { PlatformSupport } from "../../../components/platform-support";
export default function OrganizerSupportPage() {
  return (
    <OrganizerWorkspaceShell active="support">
      <PlatformSupport />
    </OrganizerWorkspaceShell>
  );
}
