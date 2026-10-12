import type { EventLocale, GuestTicket } from "@event-platform/shared-types";
import { INTL_LOCALES } from "./locale";
import { TICKET_ACTIONS_COPY } from "./ticket-actions-copy";

export function ticketDate(startsAt: string, timezone: string, locale: EventLocale): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(new Date(startsAt));
}

export function saveTicketBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  // Allow the browser to begin reading the file before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A full, printable ticket, including the original server-issued QR image. */
export async function downloadTicket(ticket: GuestTicket, qr: Blob, locale: EventLocale): Promise<void> {
  const c = TICKET_ACTIONS_COPY[locale], canvas = document.createElement("canvas");
  canvas.width = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(c.failed);
  await document.fonts.ready;
  const draw: Array<() => void> = [];
  let y = 165;
  function text(value: string, size: number, bold = false, color = "#151b27") {
    const font = `${bold ? 700 : 400} ${size}px Arial, sans-serif`;
    ctx!.font = font;
    function lineAt(value: string, position: number) {
      draw.push(() => { ctx!.font = font; ctx!.fillStyle = color; ctx!.fillText(value, 64, position); });
    }
    // Wrap by grapheme so long addresses, identifiers and CJK text never clip.
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const { segment } of new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(paragraph)) {
        if (line && ctx!.measureText(line + segment).width > 872) { lineAt(line, y); y += size * 1.45; line = ""; }
        line += segment;
      }
      lineAt(line, y); y += size * 1.45;
    }
    y += 15;
  }
  text(ticket.eventTitle, 38, true);
  text(`${c.ticket}: ${ticket.ticketTypeName}`, 27);
  if (ticket.seatLabel) text(`${c.seat}: ${ticket.seatLabel}`, 27);
  if (ticket.eventDetails) {
    text(c.date, 20, false, "#635b70");
    text(`${ticketDate(ticket.eventDetails.startsAt, ticket.eventDetails.timezone, locale)} · ${ticket.eventDetails.timezone}`, 27);
    text(c.venue, 20, false, "#635b70"); text(ticket.eventDetails.address || c.noAddress, 27);
  }
  const url = URL.createObjectURL(qr);
  try {
    const image = new Image(); image.src = url; await image.decode();
    y += 15; const qrTop = y; y += 530;
    text(c.qrHint, 23, false, "#635b70");
    text(`${c.number}: ${ticket.id}`, 20, false, "#635b70");
    // Size after wrapping to preserve long titles and multiline venue addresses.
    canvas.height = Math.ceil(y + 40);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#641cff"; ctx.fillRect(0, 0, canvas.width, 14);
    ctx.font = "700 40px Arial, sans-serif"; ctx.fillText("TICKET", 64, 90);
    for (const render of draw) render();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 260, qrTop, 480, 480);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(c.failed)), "image/png"));
    saveTicketBlob(blob, `ticket-${ticket.id}.png`);
  } finally { URL.revokeObjectURL(url); }
}
