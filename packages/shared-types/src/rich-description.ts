/** An explicit envelope keeps existing plain-text descriptions literal. */
export const RICH_DESCRIPTION_PREFIX = '<div data-ticket-rich-text="1">';
export function richDescriptionBody(value: string): string | null {
  return value.startsWith(RICH_DESCRIPTION_PREFIX) && value.endsWith("</div>")
    ? value.slice(RICH_DESCRIPTION_PREFIX.length, -6) : null;
}
export function wrapRichDescription(html: string): string {
  return `${RICH_DESCRIPTION_PREFIX}${html}</div>`;
}
