import { describe, expect, it } from "vitest";
import { receiptTicketPrice, ticketDateTime, ticketNumber } from "./ticket-receipt.js";
import type { CheckoutSnapshot } from "./booking.js";
describe("ticket receipt data",()=>{
 it("uses a full unique ticket identity rather than a shared order number",()=>{expect(ticketNumber("11111111-1111-4111-8111-111111111111")).toBe("TKT-11111111111141118111111111111111");expect(ticketNumber("11111111-1111-4111-8111-111111111112")).not.toBe(ticketNumber("11111111-1111-4111-8111-111111111111"));});
 it("formats the accepted local event date without shifting it to the browser timezone",()=>{expect(ticketDateTime("2026-10-25","18:00","Europe/Moscow","ru")).toContain("25 октября 2026");expect(ticketDateTime("2026-10-25","18:00","Europe/Moscow","en")).toContain("25 October 2026");});
 it("uses the frozen item amount and quantity for combined ticket purchases",()=>{const snapshot={itemKind:"cart",items:[{id:"ticket",quantity:2,amountDue:3000}]} as CheckoutSnapshot;expect(receiptTicketPrice(snapshot,["ticket"],9000)).toBe(1500);expect(receiptTicketPrice({itemKind:"ticket",quantity:3} as CheckoutSnapshot,[],3000)).toBe(1000);});
});
