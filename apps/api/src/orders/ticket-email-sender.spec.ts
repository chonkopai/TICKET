import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendTicketEmailSender } from "./ticket-email-sender.js";
afterEach(()=>vi.unstubAllGlobals());
describe("ticket email inline and PDF attachments",()=>{
 it("sends the QR Content-ID and PDF attachment through the email provider's attachment contract",async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"test-message"}),{headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",request);
  const attachments=[{filename:"qr.png",content:"cXItcG5n",content_type:"image/png",content_id:"ticket-123"},{filename:"ticket.pdf",content:"cGRm",content_type:"application/pdf"}];
  const result=await new ResendTicketEmailSender("re_test_only","tickets@mail.ticketron.live").send({to:"attendee@example.test",subject:"Ticket",text:"Ticket",html:'<img src="cid:ticket-123"/>',attachments,idempotencyKey:"ticket-email/test/1"});
  expect(result.id).toBe("test-message");
  expect(JSON.parse(request.mock.calls[0]![1].body).attachments).toEqual(attachments);
  expect(request.mock.calls[0]![1].headers["Idempotency-Key"]).toBe("ticket-email/test/1");
 });
});
