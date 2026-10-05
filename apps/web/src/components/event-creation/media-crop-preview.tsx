"use client";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { boundedMediaCrop, panMediaCrop, type EventLocale, type MediaCrop } from "@event-platform/shared-types";
import { FramedMedia } from "./framed-media";

const words = {
  en: { drag: "Drag the image to reposition its crop", hint: "Drag to reposition · use + and − to zoom", in: "Zoom in", out: "Zoom out", expand: "Enlarge preview", close: "Close", title: "Adjust image crop" },
  ru: { drag: "Перетащите изображение, чтобы изменить кадрирование", hint: "Перетащите изображение · масштаб: + и −", in: "Приблизить", out: "Отдалить", expand: "Увеличить предпросмотр", close: "Закрыть", title: "Кадрирование изображения" },
  kk: { drag: "Қиып алуды өзгерту үшін суретті сүйреңіз", hint: "Суретті сүйреңіз · масштаб: + және −", in: "Жақындату", out: "Алыстату", expand: "Алдын ала қарауды үлкейту", close: "Жабу", title: "Суретті қиып алу" },
};
type Props = { src: string; width: number; height: number; crop: MediaCrop; alt: string; locale: EventLocale; disabled: boolean; onChange: (crop: MediaCrop) => void };

function CropFrame({ src, width, height, crop, alt, locale, disabled, onChange, onCommit }: Props & { onCommit: (crop: MediaCrop) => void }) {
  const start = useRef<{ pointerId: number; x: number; y: number; width: number; height: number; crop: MediaCrop; last: MediaCrop } | null>(null);
  const [dragging, setDragging] = useState(false);
  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, crop, last: crop };
    setDragging(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const initial = start.current;
    if (!initial || initial.pointerId !== event.pointerId) return;
    initial.last = panMediaCrop(width, height, initial.crop, (event.clientX - initial.x) / initial.width, (event.clientY - initial.y) / initial.height);
    onChange(initial.last);
  }
  function finish() { const initial = start.current; start.current = null; setDragging(false); if (initial && (initial.last.focalX !== initial.crop.focalX || initial.last.focalY !== initial.crop.focalY)) onCommit(initial.last); }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.025], ArrowDown: [0, .025] }[event.key];
    if (!delta || disabled) return;
    event.preventDefault();
    const next = panMediaCrop(width, height, crop, delta[0]!, delta[1]!);
    onChange(next); onCommit(next);
  }
  return <div role="group" tabIndex={disabled ? -1 : 0} aria-label={words[locale].drag} data-crop-preview="true" className={`aspect-video w-full touch-none overflow-hidden rounded-xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-violet-500 ${dragging ? "cursor-grabbing" : "cursor-grab"}`} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onKeyDown={key}>
    <div className="pointer-events-none h-full w-full select-none"><FramedMedia src={src} kind="image" width={width} height={height} crop={crop} alt={alt} className="h-full w-full" /></div>
  </div>;
}

export function MediaCropPreview(props: Props) {
  const [expanded, setExpanded] = useState(false), [liveCrop, setLiveCrop] = useState(props.crop);
  useEffect(() => { setLiveCrop(props.crop); }, [props.crop.focalX, props.crop.focalY, props.crop.zoom]);
  const frameProps = { ...props, crop: liveCrop, onChange: setLiveCrop, onCommit: props.onChange };
  const dialog = useRef<HTMLDialogElement>(null), c = words[props.locale];
  useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);
  function zoom(delta: number) {
    const next = boundedMediaCrop(props.width, props.height, { ...liveCrop, zoom: Math.min(5, Math.max(1, Math.round((liveCrop.zoom + delta) * 100) / 100)) });
    setLiveCrop(next); props.onChange(next);
  }
  function controls(large: boolean) {
    return <div className="mt-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2"><button type="button" className="creation-button creation-media-icon-button creation-crop-tool" disabled={props.disabled || liveCrop.zoom <= 1} aria-label={c.out} title={c.out} onClick={() => zoom(-.25)}>−</button><output aria-live="polite" className="min-w-10 text-center text-xs text-slate-500 dark:text-ticket-muted">{Math.round(liveCrop.zoom * 100)}%</output><button type="button" className="creation-button creation-media-icon-button creation-crop-tool" disabled={props.disabled || liveCrop.zoom >= 5} aria-label={c.in} title={c.in} onClick={() => zoom(.25)}>+</button></div>
      {!large ? <button type="button" className="creation-button creation-media-icon-button creation-crop-tool" aria-label={c.expand} title={c.expand} onClick={() => setExpanded(true)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></svg></button> : null}
    </div>;
  }
  return <div><CropFrame {...frameProps} />{controls(false)}<p className="creation-media-help mt-2">{c.hint}</p>
    {expanded ? <dialog ref={dialog} aria-label={c.title} onClose={() => setExpanded(false)} className="fixed inset-0 m-auto max-h-[92dvh] w-[min(1000px,96vw)] overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 backdrop:bg-black/60 dark:bg-ticket-surface dark:text-ticket-text"><header className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">{c.title}</h2><button autoFocus type="button" className="creation-button" onClick={() => dialog.current?.close()}>{c.close}</button></header><CropFrame {...frameProps} />{controls(true)}<p className="creation-media-help mt-2">{c.hint}</p></dialog> : null}
  </div>;
}
