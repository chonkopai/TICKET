import { acceptedResourceName, readCheckoutSnapshot, receiptTicketPrice, ticketDateTime, ticketNumber, TICKET_RECEIPT_COPY, type EventLocale } from "@event-platform/shared-types";
import type { PrismaClient } from "@event-platform/database";
import { NotFoundException } from "@nestjs/common";
import { deflateSync } from "node:zlib";
import sharp from "sharp";

export interface TicketDocument {
 id:string; number:string; title:string; name:string; seatLabel:string|null; date:string; address:string; orderId:string; buyerName:string; createdAt:string; timezone?:string; price:number; currency:string; refund:string; locale:EventLocale;
}
export async function orderTicketDocuments(db:PrismaClient,orderId:string) {
 const order=await db.order.findUnique({where:{id:orderId},include:{buyer:{select:{name:true}},anonymousSession:{select:{name:true}},tickets:{include:{ticketType:{select:{name:true,isInternal:true}},seatAllocation:{select:{seatId:true,seat:{select:{tableId:true}}}}},orderBy:{id:"asc"}}}});
 if(!order)throw new NotFoundException({code:"ORDER_NOT_FOUND"});
 const snapshot=readCheckoutSnapshot(order.checkoutSnapshot),locale=snapshot.contentLocale??"ru",copy=TICKET_RECEIPT_COPY[locale];
 const contact=order.guestContact as {name?:unknown}|null;
 const buyerName=order.anonymousSession?.name??(typeof contact?.name==="string"?contact.name:order.buyer?.name)??"—";
 const refund=snapshot.acceptedPolicy?.freeCancellation || order.amount===0 ? copy.freeRefund : snapshot.cancellationTerms??copy.noRefund;
 return {order,snapshot,tickets:order.tickets.map(ticket=>{
  const ids=[ticket.ticketTypeId,ticket.seatAllocation?.seatId,ticket.seatAllocation?.seat.tableId];
  const document:TicketDocument={id:ticket.id,number:ticketNumber(ticket.id),title:snapshot.eventTitle,name:acceptedResourceName(snapshot,ids,ticket.ticketType.isInternal?ticket.seatLabelSnapshot??copy.ticket:ticket.ticketType.name),seatLabel:ticket.seatLabelSnapshot,date:ticketDateTime(snapshot.eventDate,snapshot.eventTime,snapshot.eventTimezone,locale),address:snapshot.address??snapshot.venueName??"",orderId:order.id,buyerName,createdAt:order.createdAt.toISOString(),timezone:snapshot.eventTimezone??"UTC",price:receiptTicketPrice(snapshot,ids,order.amount),currency:order.currency.trim(),refund,locale};
  return {document,status:ticket.status,qrToken:ticket.qrToken};
 })};
}
export function escapeTicketHtml(value:string):string{return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);}
export function ticketMoney(value:number,currency:string,locale:EventLocale):string{return value===0?TICKET_RECEIPT_COPY[locale].free:new Intl.NumberFormat({ru:"ru-RU",en:"en-GB",kk:"kk-KZ"}[locale],{style:"currency",currency}).format(value/100);}
export function ticketOrderDate(document:TicketDocument):string{return new Intl.DateTimeFormat({ru:"ru-RU",en:"en-GB",kk:"kk-KZ"}[document.locale],{dateStyle:"long",timeStyle:"short",timeZone:document.timezone??"UTC"}).format(new Date(document.createdAt))+` (${document.timezone??"UTC"})`;}
function lines(text:string,max:number):string[]{const result:string[]=[];let current="";for(const word of text.split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${max}}`, "gu")) ?? [])){if(current.length+word.length+1>max&&current){result.push(current);current="";}current+=(current?" ":"")+word;}if(current)result.push(current);return result;}
/** A lossless, self-contained PDF page: the same QR and receipt fields as the web/email. */
export async function renderTicketPdf(document:TicketDocument,qr:Buffer):Promise<Buffer>{
 const copy=TICKET_RECEIPT_COPY[document.locale];
 const width=1600;let y=195;
 const text=(value:string,size=28,color="#182030",weight=400,x=80,max=75)=>{const rows=lines(value,max);let out="";for(const row of rows){out+=`<text x="${x}" y="${y}" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeTicketHtml(row)}</text>`;y+=size*1.55;}return out;};
 let content=text(document.title,48,"#182030",700,80,32);content+=text(document.date,26,"#625b73",400,80,58);content+=text(document.address,26,"#625b73",400,80,58);y+=22;
 content+=text(document.name,32,"#6825f5",700,80,43);if(document.seatLabel)content+=text(document.seatLabel,25,"#625b73",400,80,55);
 y=Math.max(y+28,430);
 for(const [label,value] of [[copy.order,document.orderId],[copy.buyer,document.buyerName],[copy.orderedAt,ticketOrderDate(document)],[copy.price,ticketMoney(document.price,document.currency,document.locale)],[copy.number,document.number]]){content+=text(label!.toUpperCase(),18,"#797287",600,80,64);content+=text(value!,25,"#182030",500,80,56);y+=15;}
 const footerY=Math.max(y+24,1000);y=footerY;
 content+=text(copy.refund,25,"#182030",700,80,95);content+=text(document.refund,24,"#625b73",400,80,100);y+=20;content+=text(copy.warning,22,"#625b73",400,80,108);
 const height=Math.ceil(y+70);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><rect width="100%" height="104" fill="#6825f5"/><text x="80" y="70" font-family="DejaVu Sans, sans-serif" font-size="42" font-weight="700" fill="white">TICKET</text><text x="1520" y="65" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="22" fill="white">${escapeTicketHtml(copy.ticket)}</text><path d="M1010 155V${footerY-35}" stroke="#ded9e9" stroke-dasharray="12 12"/>${content}<text x="1260" y="670" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="21" fill="#625b73">${escapeTicketHtml(copy.show)}</text></svg>`;
 const image=await sharp(Buffer.from(svg)).composite([{input:await sharp(qr).resize(440,440,{kernel:"nearest"}).png().toBuffer(),left:1040,top:190}]).removeAlpha().raw().toBuffer();
 const compressed=deflateSync(image),command=Buffer.from(`q\n800 0 0 ${height/2} 0 0 cm\n/Im0 Do\nQ\n`);
 const objects=[Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 ${height/2}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`),compressed,Buffer.from("\nendstream")]),Buffer.concat([Buffer.from(`<< /Length ${command.length} >>\nstream\n`),command,Buffer.from("endstream")])];
 const chunks=[Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","binary")],offsets=[0];let offset=chunks[0]!.length;
 objects.forEach((object,index)=>{offsets.push(offset);const chunk=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),object,Buffer.from("\nendobj\n")]);chunks.push(chunk);offset+=chunk.length;});
 chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));return Buffer.concat(chunks);
}
