"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const EVENT_PREVIEW_VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

/** An isolated viewport preserves the public page's media queries and viewport units. */
export function ScaledEventPreview({ device, title, locale, children }: { device: "desktop" | "phone"; title: string; locale: string; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null), iframe = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(0), [target, setTarget] = useState<HTMLElement | null>(null);
  const viewport = EVENT_PREVIEW_VIEWPORTS[device];
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let observer: MutationObserver | undefined;
    const initialize = () => {
      const doc = frame.contentDocument;
      // The iframe document can exist before its head and body are available.
      if (!doc || doc.readyState === "loading" || !doc.head || !doc.body) return;
      const sync = () => {
        if (frame.contentDocument !== doc || !doc.head || !doc.body) return;
        doc.head.replaceChildren(...Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'), node => node.cloneNode(true)));
        const base = doc.createElement("base"); base.href = document.baseURI; doc.head.prepend(base);
        const style = doc.createElement("style"); style.textContent = "html{scrollbar-width:thin}body{margin:0}"; doc.head.append(style);
        doc.documentElement.className = document.documentElement.className;
        doc.documentElement.style.cssText = document.documentElement.style.cssText;
        doc.body.className = document.body.className;
        doc.body.style.cssText = document.body.style.cssText;
      };
      sync(); setTarget(doc.body);
      observer?.disconnect(); observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    };
    frame.addEventListener("load", initialize);
    initialize();
    return () => { frame.removeEventListener("load", initialize); observer?.disconnect(); };
  }, []);
  useEffect(() => { if (target) target.ownerDocument.documentElement.lang = locale; }, [target, locale]);
  return <div ref={container} className="creation-preview-viewport" lang={locale} data-device={device} style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}>
    <iframe ref={iframe} title={title} srcDoc="<!doctype html><html><head></head><body></body></html>" sandbox="allow-same-origin" className="creation-preview-frame" style={{ width: viewport.width, height: viewport.height, transform: `scale(${width / viewport.width})` }} />
    {target ? createPortal(children, target) : <div hidden>{children}</div>}
  </div>;
}
