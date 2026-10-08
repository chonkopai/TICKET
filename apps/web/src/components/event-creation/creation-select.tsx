"use client";
import { useCreationValidation } from "./creation-validation";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export type CreationOption = { value: string; label: string; selectedLabel?: string; detail?: string; keywords?: string; pinned?: boolean };
const copy = {
  ru: { search: "Поиск", empty: "Ничего не найдено" },
  en: { search: "Search", empty: "No matches" },
  kk: { search: "Іздеу", empty: "Ештеңе табылмады" },
};
const normalize = (text: string) => text.normalize("NFKD").toLocaleLowerCase().replace(/ё/g, "е");

/** A searchable select with the same keyboard behavior for country, city and currency. */
export function CreationSelect({ label, value, options, onChange, placeholder, required = false, disabled = false, searchable = false, locale, searchLabel, counter, className = "", describedBy, menuMinWidth = 0, validationKey }: {
  label: string; value: string; options: CreationOption[]; onChange: (value: string) => void; placeholder: string;
  required?: boolean; disabled?: boolean; searchable?: boolean; locale: "ru" | "en" | "kk"; searchLabel?: string; counter?: string; className?: string; describedBy?: string; menuMinWidth?: number; validationKey?: string;
}) {
  const validation = useCreationValidation(validationKey);
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => option.pinned || normalize(`${option.label} ${option.detail ?? ""} ${option.keywords ?? ""}`).includes(normalize(query.trim())));
  const searchName = searchLabel ?? `${copy[locale].search}: ${label}`;
  const close = (restoreFocus = false) => { setOpen(false); setQuery(""); if (restoreFocus) trigger.current?.focus(); };
  const choose = (next: string) => { close(true); onChange(next); };
  const show = () => { setQuery(""); setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect(), height = window.visualViewport?.height ?? innerHeight;
      const footerHeight = document.querySelector(".creation-footer")?.getBoundingClientRect().height ?? 0;
      const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 60;
      const bottom = height - footerHeight - rect.bottom - 12, top = rect.top - headerHeight - 12, above = bottom < 210 && top > bottom;
      const maxHeight = Math.min(330, Math.max(120, above ? top : bottom));
      const width = Math.min(Math.max(rect.width, menuMinWidth), innerWidth - 16);
      const popupHeight = Math.min(maxHeight, (searchable ? 60 : 8) + matches.length * 44 + 8);
      setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top: above ? rect.top - popupHeight - 6 : rect.bottom + 6, width, maxHeight });
    };
    place(); window.addEventListener("resize", place); window.visualViewport?.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place); window.visualViewport?.removeEventListener("resize", place); };
  }, [open, searchable, matches.length, menuMinWidth]);
  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus();
    const outside = (event: PointerEvent | FocusEvent) => { if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); } };
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); window.removeEventListener("scroll", scroll, true); };
  }, [open, searchable]);
  useLayoutEffect(() => {
    if (!open || !position.width) return;
    const list = panel.current?.querySelector<HTMLElement>("[role=listbox]"), option = document.getElementById(`${id}-option-${active}`);
    if (!list || !option) return;
    const bounds = list.getBoundingClientRect(), item = option.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }, [active, open, id, position.width, position.maxHeight, query]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "Tab") close();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      if (!open && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(index => event.key === "Home" ? 0 : event.key === "End" ? matches.length - 1 : Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (open && event.key === "Enter") { event.preventDefault(); const option = matches[active]; if (option) choose(option.value); }
    else if (!open && searchable && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setQuery(event.key); setActive(0); setOpen(true); }
  }
  return <div {...validation.wrapper} ref={root} className={`creation-field creation-dropdown ${className}`}>
    <div className="creation-field-label creation-dropdown-label"><label id={`${id}-label`} htmlFor={id}>{label}{required ? <span aria-hidden="true" className="creation-required"> *</span> : null}</label>{counter ? <span className="creation-counter">{counter}</span> : null}</div>
    <button ref={trigger} id={id} type="button" role="combobox" aria-label={label} aria-invalid={validation.invalid} aria-describedby={[describedBy, validation.control["aria-describedby"]].filter(Boolean).join(" ") || undefined} title={selected?.label} aria-required={required} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && !searchable && matches[active] ? `${id}-option-${active}` : undefined} disabled={disabled} className="creation-dropdown-trigger" data-empty={!value} onClick={() => open ? close() : show()} onKeyDown={keyboard}>
      <span>{selected?.selectedLabel ?? selected?.label ?? (value || placeholder)}</span><svg aria-hidden="true" className="creation-dropdown-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {validation.error}
    {open ? createPortal(<div ref={panel} className={`creation-dropdown-panel ${menuMinWidth ? "creation-dropdown-panel-wide" : ""}`} style={position} onKeyDown={keyboard}>
      {searchable ? <div className="creation-dropdown-search"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg><input ref={search} role="combobox" aria-label={searchName} aria-expanded aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={matches[active] ? `${id}-option-${active}` : undefined} placeholder={searchName} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} /></div> : null}
      <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="creation-dropdown-list">
        {matches.map((option, index) => <button type="button" role="option" aria-selected={option.value === value} tabIndex={-1} id={`${id}-option-${index}`} key={option.value} className="creation-dropdown-option" data-active={index === active} data-pinned={option.pinned || undefined} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(option.value)}><span><span>{option.label}</span>{option.detail ? <small>{option.detail}</small> : null}</span>{option.value === value ? <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</button>)}
        {!matches.length ? <p className="creation-dropdown-empty" role="status">{copy[locale].empty}</p> : null}
      </div>
    </div>, root.current?.closest(".creation-workspace") ?? document.body) : null}
  </div>;
}
