import type { ReactNode } from "react";

import "./workspace.css";

export default function OrganizerEventLayout({ children }: { children: ReactNode }) {
  return <div className="organizer-event-workspace">{children}</div>;
}
