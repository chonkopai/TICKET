import sanitizeHtml from "sanitize-html";
import { richDescriptionBody, wrapRichDescription } from "@event-platform/shared-types";

export function safeDescriptionLink(value: string): string | null {
  const trimmed = value.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "mailto:") return url.pathname ? url.href : null;
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "strong", "em", "ul", "ol", "li", "a"],
    allowedAttributes: { a: ["href", "target", "rel"], ol: ["start"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      b: "strong",
      i: "em",
      a: (_tag, attrs) => {
        const href = safeDescriptionLink(attrs.href ?? "");
        return { tagName: "a", attribs: href ? { href, target: "_blank", rel: "noopener noreferrer" } : {} };
      },
    },
  });
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function descriptionEditorHtml(value: string): string {
  const body = richDescriptionBody(value);
  return body === null ? value.split("\n").map(line => `<p>${escapeText(line)}</p>`).join("") : sanitizeDescriptionHtml(body);
}
export function encodeDescription(html: string, text: string): string {
  if (!text.trim()) return "";
  const clean = sanitizeDescriptionHtml(html);
  return /<(h1|h2|strong|em|ul|ol|a)(\s|>)/.test(clean) ? wrapRichDescription(clean) : text;
}
