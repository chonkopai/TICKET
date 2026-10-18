import { TICKET_RECEIPT_COPY, type EventLocale } from "@event-platform/shared-types";
import QRCode from "qrcode";
import { renderTicketPdf, ticketMoney, ticketOrderDate, escapeTicketHtml as escapeHtml, type TicketDocument } from "./ticket-document.js";
import type { TicketEmailMessage } from "./ticket-email-sender.js";

export async function renderTicketEmail(tickets: Array<{document:TicketDocument;status:string;qrToken:string}>, options: {locale:EventLocale; accessUrl:string;amount:number;title:string;labels:string;recipient:string;idempotencyKey:string}): Promise<TicketEmailMessage> {
    const copy = TICKET_RECEIPT_COPY[options.locale];
    const accessUrl = options.accessUrl;
    const attachments: NonNullable<TicketEmailMessage["attachments"]> = [];
    const sections: string[] = [], textSections: string[] = [];
    for (const ticket of tickets.filter(item => item.status === "active" || item.status === "used")) {
      const document = ticket.document;
      const qr = await QRCode.toBuffer(ticket.qrToken, { type: "png", width: 440, margin: 4, errorCorrectionLevel: "M" });
      const cid = `ticket-${document.id}`;
      attachments.push({ filename: `${cid}.png`, content: qr.toString("base64"), content_type: "image/png", content_id: cid });
      attachments.push({ filename: `${cid}.pdf`, content: (await renderTicketPdf(document, qr)).toString("base64"), content_type: "application/pdf" });
      const fields = [[copy.order, document.orderId], [copy.buyer, document.buyerName], [copy.orderedAt, ticketOrderDate(document)], [copy.price, ticketMoney(document.price, document.currency, document.locale)], [copy.number, document.number]];
      textSections.push(`${document.name}${document.seatLabel ? ` · ${document.seatLabel}` : ""}\n${document.date}\n${document.address}\n${fields.map(([label,value]) => `${label}: ${value}`).join("\n")}\n${copy.warning}\n${copy.refund}: ${document.refund}`);
      sections.push(`<section style="padding:24px;margin:20px 0;border:1px solid #e7e1f0;border-radius:20px;background:white"><h2 style="margin:0 0 12px;color:#6825f5">${escapeHtml(document.name)}</h2>${document.seatLabel ? `<p>${escapeHtml(document.seatLabel)}</p>` : ""}<p>${escapeHtml(document.date)}<br>${escapeHtml(document.address)}</p><p style="text-align:center"><img src="cid:${cid}" alt="QR" width="240" height="240" style="display:block;margin:20px auto;max-width:100%;height:auto"/>${escapeHtml(copy.show)}</p><p style="padding:16px;background:#f5f0ff;border-radius:12px;font-size:13px;line-height:1.6">${escapeHtml(copy.warning)}</p><table role="presentation" style="width:100%;font-size:14px">${fields.map(([label,value]) => `<tr><td style="padding:8px 12px 8px 0;color:#70677d;vertical-align:top">${escapeHtml(label!)}</td><td style="padding:8px 0;overflow-wrap:anywhere">${escapeHtml(value!)}</td></tr>`).join("")}</table><h3>${escapeHtml(copy.refund)}</h3><p style="line-height:1.6">${escapeHtml(document.refund)}</p></section>`);
    }
    const heading = options.amount === 0 ? copy.freeReady : copy.ready;
    const labels = options.labels;
    const text = `${heading}: ${options.title}\n${labels}\n${textSections.join("\n\n")}\n${copy.emailHint}\n${accessUrl}`;
    const html = `<!doctype html><html lang="${options.locale}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div style="background:#f8f6fc;padding:28px 16px;font-family:Arial,sans-serif;color:#182030"><main style="max-width:640px;margin:auto"><p style="color:#6825f5;font-size:25px;font-weight:bold">TICKET</p><p style="color:#16865b">${escapeHtml(heading)}</p><h1 style="font-size:30px">${escapeHtml(options.title)}</h1><p>${escapeHtml(labels)}</p>${sections.join("")}<p>${escapeHtml(copy.emailHint)}</p><p><a style="display:inline-block;background:#6825f5;color:white;text-decoration:none;padding:14px 20px;border-radius:12px" href="${escapeHtml(accessUrl)}">${escapeHtml(copy.ticket)}</a></p></main></div></body></html>`;
    return { to: options.recipient, subject: `${({ru:"Билеты",en:"Tickets",kk:"Билеттер"})[options.locale]} TICKET — ${options.title}`, text, html, attachments, idempotencyKey: options.idempotencyKey };
}
