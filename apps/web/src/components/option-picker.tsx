"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useLocale } from "./locale-provider";

export type PickerOption = { value: string; label: string; disabled?: boolean | undefined };

export function OptionPicker({ label, value, options, onChange, className = "", disabled = false, id: buttonId, appearance = "default", icon, onDark = false }: {
  label: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string | undefined;
  appearance?: "default" | "bare" | "borderless";
  icon?: ReactNode;
  onDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (open) list.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  function nextEnabled(from: number, direction: number) {
    let next = from;
    for (let index = 0; index < options.length; index++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    return next;
  }

  function move(direction: number) {
    const next = nextEnabled(focusIndex, direction);
    setFocusIndex(next);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[next]?.focus();
  }

  return <div className={`relative ${className}`} ref={root}>
    <button aria-controls={id} aria-expanded={open} aria-haspopup="listbox" aria-label={label} className={`inline-flex min-h-10 items-center text-left text-sm font-semibold transition focus-visible:outline-none disabled:opacity-50 ${onDark ? "text-white" : "text-slate-700 dark:text-ticket-muted"} ${appearance === "bare" ? "w-auto justify-start gap-1.5 rounded-full bg-transparent px-1 py-2 focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent" : appearance === "borderless" ? "w-full justify-between gap-3 rounded-xl bg-transparent px-2 py-2 hover:bg-slate-50 dark:hover:bg-ticket-bg focus-visible:bg-violet-50 dark:focus-visible:bg-ticket-accent-soft" : "w-full justify-between gap-3 rounded-xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 py-2 shadow-sm hover:border-violet-300 dark:hover:border-ticket-accent focus-visible:ring-2 focus-visible:ring-violet-500 dark:focus-visible:ring-ticket-accent"}`} disabled={disabled} id={buttonId} onClick={() => { setFocusIndex(Math.max(current, 0)); setOpen((previous) => !previous); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setFocusIndex(nextEnabled(Math.max(current, 0), event.key === "ArrowDown" ? 1 : -1)); } }} type="button">
      <span className="inline-flex min-w-0 items-center gap-1.5">{icon}<span className="truncate">{options[current]?.label ?? options[0]?.label ?? label}</span></span><svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
    </button>
    {open ? <div aria-label={label} className="absolute right-0 top-full z-50 mt-2 max-h-64 min-w-[13rem] max-w-[90vw] overflow-y-auto rounded-2xl border border-slate-200 dark:border-ticket-border bg-white dark:bg-ticket-surface p-1.5 shadow-[0_18px_45px_rgba(15,23,42,.16)]" id={id} ref={list} role="listbox">
      {options.map((option, index) => <button aria-disabled={option.disabled} aria-selected={option.value === value} className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-violet-50 dark:hover:bg-ticket-accent-soft focus-visible:bg-violet-50 dark:focus-visible:bg-ticket-accent-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${option.value === value ? "bg-violet-50 dark:bg-ticket-accent-soft font-semibold text-violet-700 dark:text-ticket-accent" : "text-slate-700 dark:text-ticket-muted"}`} disabled={option.disabled} key={option.value} onClick={() => { onChange(option.value); setOpen(false); root.current?.querySelector("button")?.focus(); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); } else if (event.key === "Home") { event.preventDefault(); const first = options.findIndex((item) => !item.disabled); setFocusIndex(first); list.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[first]?.focus(); } else if (event.key === "End") { event.preventDefault(); const last = options.findLastIndex((item) => !item.disabled); setFocusIndex(last); list.current?.querySelectorAll<HTMLButtonElement>("[role=option]")[last]?.focus(); } }} role="option" tabIndex={index === focusIndex ? 0 : -1} type="button"><span>{option.label}</span>{option.value === value ? <span aria-hidden="true">✓</span> : null}</button>)}
    </div> : null}
  </div>;
}

function optionText(value: ReactNode): string {
  return Children.toArray(value).map((part) => typeof part === "string" || typeof part === "number" ? String(part) : isValidElement<{ children?: ReactNode }>(part) ? optionText(part.props.children) : "").join("");
}

export function SelectPicker({ children, value, onChange, disabled = false, id, className = "", ...props }: {
  children: ReactNode;
  value: string;
  onChange: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const locale = useLocale();
  const options = Children.toArray(children).filter(isValidElement).map((child) => {
    const item = child as ReactElement<{ value?: string; children?: ReactNode; disabled?: boolean }>;
    const label = optionText(item.props.children);
    return { value: item.props.value ?? label, label, disabled: item.props.disabled };
  });
  return <OptionPicker className={`w-full ${className.includes("mt-") ? className.match(/mt-\d+/)?.[0] ?? "" : ""}`} disabled={disabled} id={id} label={props["aria-label"] ?? options[0]?.label ?? { ru: "Выбрать вариант", kk: "Нұсқаны таңдау", en: "Choose an option" }[locale]} onChange={(next) => onChange({ target: { value: next }, currentTarget: { value: next } })} options={options} value={value} />;
}
