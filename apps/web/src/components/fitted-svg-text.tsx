"use client";

import { useLayoutEffect, useRef, type SVGProps } from "react";

type Props = Omit<SVGProps<SVGTextElement>, "children" | "fontSize"> & {
  text: string;
  fontSize: number;
  maxWidth: number;
  maxHeight: number;
};

/** Keep one-line labels inside their SVG shape without changing the stored name. */
export function FittedSvgText({ text, fontSize, maxWidth, maxHeight, ...props }: Props) {
  const ref = useRef<SVGTextElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let active = true;

    const fit = () => {
      if (!active) return;
      node.setAttribute("font-size", String(fontSize));
      let width = 0;
      let height = 0;
      try {
        width = node.getComputedTextLength();
        height = node.getBBox().height;
      } catch {
        // SVG measurement is unavailable in some test and hidden-document environments.
      }
      if (!width) width = text.length * fontSize * .65;
      if (!height) height = fontSize;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      if (Number.isFinite(scale) && scale > 0) node.setAttribute("font-size", String(fontSize * scale));
    };

    fit();
    void document.fonts?.ready.then(fit);
    return () => { active = false; };
  }, [fontSize, maxHeight, maxWidth, text]);

  return <text {...props} ref={ref} dominantBaseline="middle" fontSize={fontSize} pointerEvents="none" textAnchor="middle">{text}</text>;
}
