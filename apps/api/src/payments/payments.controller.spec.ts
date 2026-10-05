import {Module} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {describe,expect,it,vi} from "vitest";
import {BookingService} from "../booking/booking.service.js";
import {AuthService} from "../auth/auth.service.js";
import {PaymentService} from "./payment.service.js";
import {OrdersPaymentController,PaymentWebhookController} from "./payments.controller.js";

describe("payment controller dependency injection",()=>{
 it("handles gateway callbacks and status in the metadata-free development runtime",async()=>{
  const normalized={eventId:"gateway-event"},result={accepted:true,duplicate:false,reviewRequired:false};
  const payments={verifyWebhook:vi.fn(()=>normalized),status:vi.fn(async()=>({status:"paid"}))};
  const booking={handlePaymentWebhook:vi.fn(async()=>result),expireDueCheckouts:vi.fn(async()=>0)};
  @Module({providers:[OrdersPaymentController,PaymentWebhookController,{provide:AuthService,useValue:{}},{provide:PaymentService,useValue:payments},{provide:BookingService,useValue:booking}]})
  class FixtureModule {}
  const app=await NestFactory.createApplicationContext(FixtureModule,{logger:false,abortOnError:false});
  try{
   const body=Buffer.from("signed fixture");
   expect(await app.get(PaymentWebhookController).webhook("mock",{rawBody:body,headers:{"x-payment-signature":"fixture-signature"}})).toEqual(result);
   expect(payments.verifyWebhook).toHaveBeenCalledWith("mock",body,{"x-payment-signature":"fixture-signature"});
   expect(booking.handlePaymentWebhook).toHaveBeenCalledWith(normalized);
   expect(await app.get(OrdersPaymentController).status({userId:"buyer"} as never,"order")).toEqual({status:"paid"});
   expect(payments.status).toHaveBeenCalledWith("buyer","order");
  }finally{await app.close();}
 });
});
