import { richDescriptionBody } from "@event-platform/shared-types";
import { sanitizeDescriptionHtml } from "../lib/rich-description";

export function EventDescription({ value }: { value: string }) {
  const body = richDescriptionBody(value);
  return body === null
    ? <p className="whitespace-pre-wrap break-words leading-7 text-ticket-muted">{value}</p>
    : <div className="ticket-rich-text break-words text-ticket-muted" dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(body) }} />;
}
