import type { ReactNode } from "react";

// Reuse the site's ticket/calendar icons and navbar heart, user and logout paths.
// Additional account symbols follow the same currentColor, rounded stroke style.
const ICONS: Record<string, ReactNode> = {
  // Existing calendar-plus, editor and event-management symbols.
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-12 3.5 3.5" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  money: <path d="M4 6h16v12H4V6Zm8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9H5m14 6h-2" />,
  ticket: <><path d="M4 5h16a1 1 0 0 1 1 1v3c-1.7 0-3 1.3-3 3s1.3 3 3 3v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3c1.7 0 3-1.3 3-3s-1.3-3-3-3V6a1 1 0 0 1 1-1Z" /><path d="M13 5v2m0 4v2m0 4v2" /></>,
  "calendar-check": <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 9h18m-13 6 2.5 2.5L16 12" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  "user-round": <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  "contact-round": <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  "log-out": <path d="M17 16l4-4m0 0-4-4m4 4H8m5 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
  "receipt-text": <><path d="M4 3l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v18l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2Z" /><path d="M8 9h8M8 13h6" /></>,
  "circle-help": <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16h.01" /></>,
  "arrow-up-right": <path d="M7 17 17 7M7 7h10v10" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "shopping-bag": <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  smartphone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  send: <path d="m21 3-6 18-4-8-8-4L21 3Zm0 0L11 13" />,
  "circle-check": <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  "shield-check": <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  "cloud-alert": <><path d="M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10M12 9v4M12 17h.01" /></>,
  "refresh-cw": <><path d="M20 7a9 9 0 0 0-15-2L3 7m0-4v4h4M4 17a9 9 0 0 0 15 2l2-2m0 4v-4h-4" /></>,
};

export function AccountIcon({ name, className = "" }: { name: string; className?: string }) {
  const content = ICONS[name];
  if (!content) throw new Error(`Unknown account icon: ${name}`);
  return <svg aria-hidden="true" className={`account-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "log-out" ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round">{content}</svg>;
}
