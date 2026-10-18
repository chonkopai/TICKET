import { inflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { createRequire } from "node:module";
const jsQR = createRequire(import.meta.url)("jsqr") as (pixels: Uint8ClampedArray, width: number, height: number) => { data: string } | null;
import { ticketNumber } from "@event-platform/shared-types";
import { renderTicketPdf, type TicketDocument } from "./ticket-document.js";
import { renderTicketEmail } from "./ticket-receipt-email.js";

const id="11111111-1111-4111-8111-111111111111";
const document:TicketDocument={id,number:ticketNumber(id),title:"Icegergert",name:"Пригласительный",seatLabel:null,date:"25 октября 2026 г. · 18:00 (Europe/Moscow)",address:"Россия, Санкт-Петербург, Большая Морская улица, 31",orderId:"22222222-2222-4222-8222-222222222222",buyerName:"Тестовый покупатель",createdAt:"2026-10-18T10:30:00Z",timezone:"Europe/Moscow",price:0,currency:"RUB",refund:"Бесплатную регистрацию можно отменить без денежного возврата.",locale:"ru"};
const token="test-only-ticket-qr-identity";
describe("guest ticket document and email",()=>{
 it("creates a valid lossless PDF whose displayed QR retains the exact admission identity",async()=>{
  const qr=await QRCode.toBuffer(token,{width:440,margin:4});
  const pdf=await renderTicketPdf(document,qr);
  expect(pdf.subarray(0,8).toString()).toBe("%PDF-1.4");
  const tail=pdf.subarray(-200).toString(),xref=Number(/startxref\n(\d+)/.exec(tail)?.[1]);
  expect(pdf.subarray(xref,xref+4).toString()).toBe("xref");
  const imageStart=pdf.indexOf(Buffer.from("4 0 obj")),stream=pdf.indexOf(Buffer.from("stream\n"),imageStart)+7;
  const header=pdf.subarray(imageStart,stream).toString(),length=Number(/\/Length (\d+)/.exec(header)?.[1]),width=Number(/\/Width (\d+)/.exec(header)?.[1]);
  const pixels=inflateSync(pdf.subarray(stream,stream+length));
  const rgba=new Uint8ClampedArray(440*440*4);
  for(let y=0;y<440;y++)for(let x=0;x<440;x++){const source=((y+190)*width+x+1040)*3,target=(y*440+x)*4;rgba[target]=pixels[source]!;rgba[target+1]=pixels[source+1]!;rgba[target+2]=pixels[source+2]!;rgba[target+3]=255;}
  expect(jsQR(rgba,440,440)?.data).toBe(token);
  if(process.env.TICKET_PDF_SAMPLE_PATH)await writeFile(process.env.TICKET_PDF_SAMPLE_PATH,pdf);
 });
 it("embeds QR images and attaches one PDF per valid ticket with the requested receipt fields",async()=>{
  const message=await renderTicketEmail([{document,status:"active",qrToken:token},{document:{...document,id:"refunded"},status:"refunded",qrToken:"must-not-be-sent"}],{locale:"ru",accessUrl:"https://example.test/delivery#token=test-only",amount:0,title:document.title,labels:"Пригласительный × 1",recipient:"attendee@example.test",idempotencyKey:"test-key"});
  expect(message.html).toContain(`src="cid:ticket-${id}"`);
  expect(message.text).toContain(document.buyerName);
  expect(message.text).toContain(document.number);
  expect(message.text).toContain("Бесплатно");
  expect(message.text).toContain("Регистрация подтверждена");
  expect(message.text).toContain("Номер заказа");
  expect(message.text).toContain("Дата заказа");
  expect(message.text).toContain(document.refund);
  expect(message.html).toContain("Не выкладывайте билет");
  expect(message.attachments).toHaveLength(2);
  expect(message.attachments?.[0]?.content_id).toBe(`ticket-${id}`);
  expect(Buffer.from(message.attachments![1]!.content,"base64").subarray(0,8).toString()).toBe("%PDF-1.4");
  expect(message.html).not.toContain("must-not-be-sent");
  if(process.env.TICKET_EMAIL_SAMPLE_PATH){
    let html=message.html;
    for(const attachment of message.attachments ?? [])if(attachment.content_id)html=html.replace(`cid:${attachment.content_id}`,`data:${attachment.content_type};base64,${attachment.content}`);
    await writeFile(process.env.TICKET_EMAIL_SAMPLE_PATH,html);
  }
 });
 it("escapes untrusted event and buyer content in receipt emails",async()=>{
  const message=await renderTicketEmail([{document:{...document,buyerName:"<script>bad</script>",name:"<img src=x onerror=alert(1)>"},status:"active",qrToken:token}],{locale:"en",accessUrl:"https://example.test",amount:100,title:"<b>Title</b>",labels:"<script>",recipient:"attendee@example.test",idempotencyKey:"test-key"});
  expect(message.html).not.toContain("<script>");expect(message.html).toContain("&lt;script&gt;");expect(message.html).toContain("&lt;b&gt;Title&lt;/b&gt;");
 });
});
