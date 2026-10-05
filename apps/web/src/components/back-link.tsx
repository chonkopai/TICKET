import { ru } from "@event-platform/shared-types";
import Link from "next/link";

type BackLinkProps = {
  href: string;
  label?: string;
  className?: string;
};

/** Consistent, keyboard-friendly navigation back to the previous section. */
export function BackLink({ href, label = ru.common.back, className = "" }: BackLinkProps) {
  return (
    <Link
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3.5 py-2 text-sm font-semibold text-zinc-700 dark:text-ticket-muted shadow-sm transition-colors hover:border-indigo-300 dark:hover:border-ticket-accent hover:bg-indigo-50 dark:hover:bg-ticket-accent-soft hover:text-indigo-700 dark:hover:text-ticket-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:focus-visible:ring-ticket-accent focus-visible:ring-offset-2 ${className}`}
      href={href}
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="m12.5 4.5-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
      <span>{label}</span>
    </Link>
  );
}
