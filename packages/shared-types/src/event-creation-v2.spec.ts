import { newHallObject } from "./hall-editor.js";
import { hallV3Editor,editorHallV3 } from "./hall-v3.js";
import { applyCreationDraftPatch } from "./creation-drafts.js";
import { describe, expect, it } from "vitest";
import { checkedOrderTotal, eventCreationDraftSchema, graphemeLength, limitedText, localTimeCandidates, mediaFrame, newEventCreationDraft, parseHistoricalPurchaseSnapshot, parseMinorAmount, publishReadyDraftSchema, resolveLocalTime, resolveSchedule, selectContentLocale, purchaseSnapshotV2Schema, DEFAULT_MEDIA_CROP } from "./event-creation-v2.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KZT = { code: "KZT", exponent: 2 };
function valid() {
  const draft = newEventCreationDraft(id(1));
  draft.selectedMode = "free";
  draft.free.capacity = 20;
  draft.free.content.ru = { name: "Регистрация" };
  draft.content.ru = { title: "Название", summary: "Анонс", description: "Описание", venueName: "Зал", address: "Адрес" };
  draft.classification = { category: "music", countryCode: "KZ", city: "Алматы", ageRestriction: 0 };
  draft.schedule = { startLocal: "2027-10-20T20:00", endLocal: "2027-10-21T01:00", timezone: "Asia/Almaty", startChoice: null, endChoice: null };
  draft.refundsAvailable = false;
  draft.media.slots[3] = id(2);
  draft.media.cardAssetId = draft.media.backgroundAssetId = id(2);
  const context = { draftId: id(9), currencies: [KZT], assets: [{ id: id(2), draftId: id(9), kind: "image" as const, state: "ready" as const, bytes: 1000, width: 1200, height: 800, durationSeconds: null }] };
  return { draft, context };
}
describe("v2 incomplete and publish contracts", () => {
  it("preserves empty target text, shared fields, inactive forms and exact media slots", () => {
    const {draft} = valid();
    draft.content.en = { title: "" };
    draft.paidGeneral = [{ id: id(4), active: true, amount: null, capacity: null, content: {kk: { name: "Билет" }} }];
    const parsed = eventCreationDraftSchema.parse(draft);
    expect(parsed.currency).toBe("KZT"); expect(parsed.content.en?.title).toBe(""); expect(parsed.media.slots).toEqual([null,null,null,id(2),null]);
    expect(parsed.paidGeneral[0]?.content.kk?.name).toBe("Билет");
  });
  it("rejects incomplete publication but permits saving it", () => {
    const draft = newEventCreationDraft(id(1));
    expect(eventCreationDraftSchema.safeParse(draft).success).toBe(true);
    expect(publishReadyDraftSchema({draftId:id(9),currencies:[KZT],assets:[]}).safeParse(draft).success).toBe(false);
  });
  it("publishes only selected mode and ignores optional incomplete locales", () => {
    const {draft,context}=valid(); draft.paidGeneral=[{id:id(4),active:true,amount:null,capacity:null,content:{}}]; draft.content.kk={title:"Тақырып"};
    expect(publishReadyDraftSchema(context).parse(draft).resolvedSchedule.endsAt).toBe("2027-10-20T20:00:00.000Z");
    expect(selectContentLocale(draft,"kk")).toEqual({locale:"ru",fallback:true,complete:true});
  });
  it("requires finite free capacity and zero price",()=>{
    const {draft,context}=valid();draft.free.capacity=null; expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(false);
    draft.free.capacity=20;draft.free.amount=1;expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(false);
  });
  it("requires supported currency, active positive paid type and refund text",()=>{
    const {draft,context}=valid();draft.selectedMode="paid_general";draft.paidGeneral=[{...draft.free,id:id(4),amount:100}];draft.refundsAvailable=true;
    expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(false);
    draft.content.ru!.refundConditions="Возврат до начала";expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(true);
    draft.currency="USD";expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(false);
  });
  it("does not count unused positive hall tariffs as a priced sale",()=>{
    const {draft,context}=valid();draft.selectedMode="paid_seated";const seat=newHallObject(id(10),"seat",3,3),empty=newHallObject(id(11),"table_rect",7,7);
    draft.paidSeated=editorHallV3({widthM:24,heightM:16},{version:1,objects:[{...seat,tariffId:id(12)},{...empty,tariffId:id(13)}],tariffs:[{id:id(12),name:"Free seat",price:0,color:"#6320ee"},{id:id(13),name:"Empty table",price:100,color:"#6320ee"}]},null,"ru");
    const result=publishReadyDraftSchema(context).safeParse(draft);expect(result.success).toBe(false);if(!result.success)expect(result.error.issues.some(issue=>issue.message==="POSITIVE_PRICE_REQUIRED")).toBe(true);
  });
  it("preserves incomplete inactive hall prices and clears refund text only on an explicit No",()=>{
    const {draft,context}=valid();draft.refundsAvailable=null;expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(true);
    draft.content.ru!.refundConditions="Paid policy";draft.content.en={refundConditions:"Translated paid policy"};expect(applyCreationDraftPatch(draft,{selectedMode:"paid_general"}).content.ru!.refundConditions).toBe("Paid policy");expect(applyCreationDraftPatch(draft,{refundsAvailable:false}).content.en!.refundConditions).toBe("");
    const hall=editorHallV3({widthM:24,heightM:16},{version:1,objects:[],tariffs:[{id:id(12),name:"Incomplete",price:0,color:"#6320ee",draftAmount:null}]},null,"ru");expect(editorHallV3(hall.room,hallV3Editor(hall,"en"),hall,"en").tariffs[0]!.amount).toBeNull();
  });
  it("rejects duplicate slots, sixth upload, foreign/unready assets and video cards",()=>{
    const {draft,context}=valid();draft.media.slots[0]=id(2);expect(eventCreationDraftSchema.safeParse(draft).success).toBe(false);draft.media.slots[0]=null;
    expect(eventCreationDraftSchema.safeParse({...draft,media:{...draft.media,slots:[...draft.media.slots,null]}}).success).toBe(false);
    context.assets[0]!.draftId=id(8);expect(publishReadyDraftSchema(context).safeParse(draft).success).toBe(false);context.assets[0]!.draftId=id(9);
    expect(publishReadyDraftSchema({...context,assets:[{...context.assets[0]!,state:"processing"}]}).safeParse(draft).success).toBe(false);
    expect(publishReadyDraftSchema({...context,assets:[{...context.assets[0]!,kind:"video",durationSeconds:30}]}).safeParse(draft).success).toBe(false);
  });
  it("keeps locale versions whole when a required translation is stale",()=>{
    const {draft}=valid();draft.content.en={...draft.content.ru};draft.free.content.en={name:"Registration"};expect(selectContentLocale(draft,"en").fallback).toBe(false);
    draft.metadata.en={title:{origin:"manual",sourceHash:null,reviewed:false,stale:true,revision:2}};
    expect(selectContentLocale(draft,"en").locale).toBe("ru");
  });
});
describe("graphemes, money and framing",()=>{
  it("counts combining sequences, flags and family emoji without truncation",()=>{
    expect(graphemeLength("a\u0301🇰🇿👩‍👩‍👧‍👦")).toBe(3);
    expect(limitedText(100).safeParse("👩‍👩‍👧‍👦".repeat(100)).success).toBe(true);
    expect(limitedText(100).safeParse("👩‍👩‍👧‍👦".repeat(101)).success).toBe(false);
    expect(limitedText(10).parse("e\u0301")).toBe("e\u0301");
  });
  it("parses exact decimal strings and refuses exponent/fraction/overflow tricks",()=>{
    expect(parseMinorAmount("0.01",KZT)).toBe(1);expect(parseMinorAmount("21474836.47",KZT)).toBe(2147483647);
    for(const text of ["1e2","0.001","-1","+1"," 1","01","NaN","21474836.48"])expect(()=>parseMinorAmount(text,KZT)).toThrow();
    expect(parseMinorAmount("1.234",{code:"BHD",exponent:3})).toBe(1234);
    expect(()=>parseMinorAmount("1.0",{code:"JPY",exponent:0})).toThrow();
  });
  it("checks totals and never adds unlike currencies",()=>{
    expect(checkedOrderTotal([{unitAmount:10,quantity:3,currency:"KZT"}],"KZT")).toBe(30);
    expect(()=>checkedOrderTotal([{unitAmount:2147483647,quantity:2,currency:"KZT"}],"KZT")).toThrow();
    expect(()=>checkedOrderTotal([{unitAmount:1,quantity:1,currency:"USD"}],"KZT")).toThrow();
  });
  it("uses cover framing without gaps at focal-point extremes",()=>{
    expect(mediaFrame(100,100,160,100,DEFAULT_MEDIA_CROP)).toEqual({width:160,height:160,x:0,y:-30});
    const result=mediaFrame(100,100,160,100,{focalX:0,focalY:1,zoom:2});
    expect(result.x).toBeLessThanOrEqual(0);expect(result.y+result.height).toBeGreaterThanOrEqual(100);
  });
});
describe("IANA schedule resolution",()=>{
  it("rejects DST gaps and requires explicit repeated-time choice",()=>{
    expect(()=>resolveLocalTime("2027-03-14T02:30","America/New_York")).toThrow("SCHEDULE_TIME_NONEXISTENT");
    const candidates=localTimeCandidates("2027-11-07T01:30","America/New_York");expect(candidates).toHaveLength(2);
    expect(()=>resolveLocalTime("2027-11-07T01:30","America/New_York")).toThrow("SCHEDULE_TIME_AMBIGUOUS");
    expect(resolveLocalTime("2027-11-07T01:30","America/New_York","later")).toBe(candidates[1]);
  });
  it("handles half-hour DST and overnight/end boundaries",()=>{
    expect(localTimeCandidates("2027-04-04T01:45","Australia/Lord_Howe")).toHaveLength(2);
    expect(()=>resolveLocalTime("2027-02-30T20:00","UTC")).toThrow();
    expect(()=>resolveLocalTime("2027-01-01T20:00","+05:00")).toThrow();
    expect(()=>resolveSchedule({startLocal:"2027-01-01T20:00",endLocal:"2027-01-01T19:00",timezone:"UTC",startChoice:null,endChoice:null})).toThrow("SCHEDULE_END_NOT_AFTER_START");
  });
});
describe("historical and new purchase promises",()=>{
  it("retains null/partial/deposit legacy snapshots without inventing accepted policies",()=>{
    const legacy={paymentMode:"deposit",amountDue:40000};expect(parseHistoricalPurchaseSnapshot(legacy)).toEqual({version:1,raw:legacy});
    expect(parseHistoricalPurchaseSnapshot(null)).toEqual({version:1,raw:null});expect(()=>parseHistoricalPurchaseSnapshot({version:3})).toThrow();
  });
  it("validates the charged amount against frozen line items",()=>{
    const snapshot={version:2,eventId:id(8),sourceLocale:"ru",contentLocale:"ru",title:"Event",venueName:"Venue",address:"Address",startsAt:"2027-01-01T20:00:00Z",endsAt:null,timezone:"UTC",saleMode:"paid_general",amount:100,currency:"KZT",acceptedAt:"2026-10-02T10:00:00Z",refund:{available:false,conditions:null,revision:1,locale:"ru",freeCancellation:false},items:[{resourceId:id(1),kind:"ticket",name:"Entry",quantity:1,unitAmount:100}]};
    expect(purchaseSnapshotV2Schema.safeParse(snapshot).success).toBe(true);expect(purchaseSnapshotV2Schema.safeParse({...snapshot,amount:99}).success).toBe(false);
  });
});
