import type { ReactNode } from "react";

const paths = {
  support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3ZM20 18v1a2 2 0 0 1-2 2h-4" /><path d="M11 21h3" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
  events: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2" /></>,
  orders: <><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z" /><path d="M15 5v3m0 3v2m0 3v3" /></>,
  finance: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18m-5 6h2M6 3h12" /></>,
  audit: <><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 11h8m-8 4h8m-8 4h4" /></>,
  moderator: <><path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" /><circle cx="12" cy="9" r="2.5" /><path d="M8 16a4 4 0 0 1 8 0" /></>,
  settings: <><path d="m10 3-.6 2.2-2 .9-2-.6-2 3.5 1.5 1.7v2.6L3.4 15l2 3.5 2-.6 2 .9L10 21h4l.6-2.2 2-.9 2 .6 2-3.5-1.5-1.7v-2.6L20.6 9l-2-3.5-2 .6-2-.9L14 3h-4Z" /><circle cx="12" cy="12" r="3" /></>,
  logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-12 4 4-4 4m-7-4h11" /></>,
} satisfies Record<string, ReactNode>;

export type StaffIconName = keyof typeof paths;

export function StaffIcon({ name }: { name: StaffIconName }) {
  return <svg className="staff-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
