"use client";
import { useEffect, useId, useState } from "react";
import { graphemeLength } from "@event-platform/shared-types";

export function CountedField({ label, value, max, onChange, multiline = false, disabled = false, placeholder, required = false, rows, autoFocus = false }: {
  label: string; value: string; max: number; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; placeholder?: string; required?: boolean; rows?: number; autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value), [composing, setComposing] = useState(false), [error, setError] = useState(false);
  useEffect(() => { if (!composing) setText(value); }, [value, composing]);
  function accept(next: string) {
    if (graphemeLength(next) > max) { setError(true); setText(value); return; }
    setError(false); setText(next); onChange(next);
  }
  const length = graphemeLength(text);
  const common = {
    id, value: text, disabled, placeholder, autoFocus, "aria-label": label, "aria-required": required, "aria-describedby": `${id}-count`,
    className: "creation-input w-full rounded-xl border border-slate-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 py-2 outline-violet-500 dark:outline-ticket-accent",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (composing) setText(event.target.value); else accept(event.target.value); },
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => { setComposing(false); accept(event.currentTarget.value); },
    "aria-invalid": error || length > max,
  };
  return <label className="creation-field block" htmlFor={id}>
    <span className="creation-field-label mb-1 flex items-start justify-between gap-3 text-sm"><span>{label}{required ? <span aria-hidden="true" className="creation-required"> *</span> : null}</span><span id={`${id}-count`} className={`creation-counter ${length > max ? "text-red-700 dark:text-ticket-danger" : "text-slate-500 dark:text-ticket-muted"}`}>{length} / {max}</span></span>
    {multiline ? <textarea {...common} rows={rows ?? (max > 2000 ? 5 : 2)} /> : <input {...common} />}
    {error ? <span role="alert" className="text-xs text-red-700 dark:text-ticket-danger">{length} / {max}</span> : null}
  </label>;
}
