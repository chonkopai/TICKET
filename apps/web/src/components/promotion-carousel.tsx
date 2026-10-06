"use client";

import { useEffect, useState } from "react";
import { useLocale } from "./locale-provider";

const COPY = {
  ru: { label: "Продвижение мероприятий", ad: "Реклама", placeholder: "Здесь могла бы быть реклама вашего мероприятия", show: "Показать баннер", pause: "Приостановить смену баннеров", play: "Продолжить смену баннеров" },
  en: { label: "Event promotion", ad: "Advertisement", placeholder: "Your event could be featured here", show: "Show banner", pause: "Pause banner rotation", play: "Resume banner rotation" },
  kk: { label: "Іс-шараларды ілгерілету", ad: "Жарнама", placeholder: "Осы жерде іс-шараңыздың жарнамасы болуы мүмкін", show: "Баннерді көрсету", pause: "Баннерлер ауысуын тоқтату", play: "Баннерлер ауысуын жалғастыру" },
};
const SLIDES = 3;
const INTERVAL = 10_000;

export function PromotionCarousel() {
  const copy = COPY[useLocale()];
  const [slide, setSlide] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = slide % SLIDES;

  useEffect(() => {
    if (paused || hovered || focused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setAnimate(true);
      setSlide(current => current >= SLIDES ? 1 : current + 1);
    }, INTERVAL);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused]);

  // The duplicate first banner lets the last slide move forward before resetting.
  useEffect(() => {
    if (slide !== SLIDES) return;
    const timer = window.setTimeout(() => { setAnimate(false); setSlide(0); }, 600);
    return () => window.clearTimeout(timer);
  }, [slide]);

  return <section
    aria-label={copy.label}
    aria-roledescription="carousel"
    className="relative mt-4 overflow-hidden rounded-xl border border-violet-100 bg-white/90 shadow-[0_4px_16px_-4px_rgba(76,29,149,0.14)] dark:border-ticket-border dark:bg-ticket-surface/90 dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)]"
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
  >
    <span className="absolute left-4 top-2.5 z-10 text-[9px] uppercase tracking-wider text-slate-400 dark:text-ticket-muted">{copy.ad}</span>
    <div
      className={`flex ${animate ? "transition-transform duration-500 ease-in-out motion-reduce:transition-none" : ""}`}
      style={{ transform: `translateX(-${slide * 100}%)` }}
      data-active-slide={active + 1}
    >
      {Array.from({ length: SLIDES + 1 }, (_, index) => <div
        key={index}
        aria-hidden={index !== slide}
        className="flex h-28 w-full shrink-0 items-center justify-center bg-gradient-to-r from-transparent via-violet-50 to-transparent px-6 pb-5 pt-5 dark:via-ticket-raised/60 sm:h-24 sm:px-14"
      ><p className="max-w-xl text-center text-sm font-medium leading-relaxed text-slate-500 dark:text-ticket-muted sm:text-base">{copy.placeholder}</p></div>)}
    </div>
    <div className="absolute bottom-2 right-3 flex items-center gap-1">
      {Array.from({ length: SLIDES }, (_, index) => <button key={index} type="button" aria-label={`${copy.show} ${index + 1}`} aria-pressed={active === index} className="grid h-6 w-6 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" onClick={() => { setAnimate(true); setSlide(index); }}><span className={`h-1.5 w-1.5 rounded-full ${active === index ? "bg-violet-400 dark:bg-ticket-accent" : "bg-slate-200 dark:bg-ticket-border"}`} /></button>)}
      <button type="button" aria-label={paused ? copy.play : copy.pause} aria-pressed={paused} onClick={() => setPaused(current => !current)} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-ticket-muted dark:hover:text-ticket-text">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">{paused ? <path d="m5 3 8 5-8 5V3Z" /> : <><rect x="4" y="3" width="2" height="10" rx=".5" /><rect x="10" y="3" width="2" height="10" rx=".5" /></>}</svg>
      </button>
    </div>
  </section>;
}
