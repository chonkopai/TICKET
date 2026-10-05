import { draftDatabaseTests } from "./draft-test-database.js";
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { prisma } from "@event-platform/database";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { AuthService } from "../auth/auth.service.js";
import { CreationDraftsController } from "./creation-drafts.controller.js";
import { DraftPublicationController } from "./draft-publication.controller.js";
import { DraftPublicationService } from "./draft-publication.service.js";
import { newEventCreationDraft } from "@event-platform/shared-types";
import { CreationDraftsService } from "./creation-drafts.service.js";

const service=new CreationDraftsService(prisma,{webOrigin:"http://localhost:3000",hmacSecret:"http-spec-only-secret-for-drafts",secureCookies:true,anonymousSeconds:2592000,ownedSeconds:7776000,cleanupGraceSeconds:604800,creationHourlyLimit:100},[{code:"KZT",exponent:2}]);
@Module({controllers:[CreationDraftsController,DraftPublicationController],providers:[{provide:DraftPublicationService,useValue:new DraftPublicationService(service,{organizerRequiresApproval:false} as never)},{provide:CreationDraftsService,useValue:service},{provide:AuthService,useValue:{authenticate:()=>{throw new Error("No authentication needed in this spec");}}}]})
class TestModule {}
describe.runIf(draftDatabaseTests)("same-origin anonymous draft HTTP boundary",()=>{
  let app:Awaited<ReturnType<typeof NestFactory.create>>,origin:string;const ids:string[]=[];
  beforeAll(async()=>{app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,"127.0.0.1");origin=await app.getUrl();});
  it("rejects missing/foreign Origin before minting a capability",async()=>{
    for(const headers of [{"content-type":"application/json"},{"content-type":"application/json",origin:"https://foreign.invalid"}]){
      const response=await fetch(`${origin}/creation-drafts`,{method:"POST",headers,body:"{}"});expect(response.status).toBe(403);expect(response.headers.get("set-cookie")).toBeNull();
    }
  });
  it("keeps capabilities only in secure HttpOnly cookies and restores via cookie",async()=>{
    const response=await fetch(`${origin}/creation-drafts`,{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:3000"},body:'{"sourceLocale":"kk"}'});
    expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toContain("no-store");const raw=await response.text(),body=JSON.parse(raw);ids.push(body.id);
    const setCookie=response.headers.get("set-cookie")!;expect(setCookie).toContain("HttpOnly; Secure; SameSite=Lax");expect(raw).not.toContain("capability");
    const cookie=setCookie.split(";")[0]!;const restored=await fetch(`${origin}/creation-drafts/${body.id}`,{headers:{cookie}});expect(restored.status).toBe(200);expect((await restored.json() as {aggregate:{sourceLocale:string}}).aggregate.sourceLocale).toBe("kk");
    const rejected=await fetch(`${origin}/creation-drafts/${body.id}`,{method:"PATCH",headers:{cookie,"content-type":"application/json",origin:"http://localhost:3000"},body:'{"revision":1,"patch":{}}'});expect(rejected.status).toBe(403);
    const accepted=await fetch(`${origin}/creation-drafts/${body.id}`,{method:"PATCH",headers:{cookie,"content-type":"application/json",origin:"http://localhost:3000","x-draft-csrf":body.csrfToken},body:'{"revision":1,"patch":{"content":{"kk":{"title":"Saved"}}}}'});expect(accepted.status).toBe(200);
    const guessed=await fetch(`${origin}/creation-drafts/${randomUUID()}`,{headers:{cookie}});expect(guessed.status).toBe(404);
  });
  it("recovers browser binding at explicit Publish while GET and unauthenticated POST never publish",async()=>{
    const created=await fetch(`${origin}/creation-drafts`,{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:3000"},body:'{"sourceLocale":"en"}'}),body=await created.json() as {id:string;csrfToken:string};ids.push(body.id);
    const capability=created.headers.getSetCookie().find(value=>value.startsWith("ticket_creation_" )&&!value.startsWith("ticket_creation_browser"))!.split(";")[0]!,assetId=randomUUID(),aggregate=newEventCreationDraft(randomUUID(),"en");aggregate.selectedMode="free";aggregate.free.capacity=10;aggregate.free.content.en={name:"Registration"};aggregate.content.en={title:"Browser recovery",summary:"Summary",description:"Description",venueName:"Venue",address:"Address"};aggregate.classification={countryCode:"KZ",city:"Almaty",category:"music",ageRestriction:0};aggregate.schedule={startLocal:"2030-12-01T20:00",endLocal:"2030-12-02T01:00",timezone:"Asia/Almaty",startChoice:null,endChoice:null};aggregate.media.slots[0]=assetId;aggregate.media.cardAssetId=assetId;aggregate.media.backgroundAssetId=assetId;
    await prisma.mediaAsset.create({data:{id:assetId,draftId:body.id,kind:"image",state:"ready",storageKey:`${assetId}/original`,checksum:"a".repeat(64),contentType:"image/png",bytes:100n,width:800,height:500,derivatives:{display:"display.webp"}}});await prisma.eventCreationDraft.update({where:{id:body.id},data:{aggregate:JSON.parse(JSON.stringify(aggregate))}});
    const before=await prisma.event.count(),headers={cookie:capability,origin:"http://localhost:3000","content-type":"application/json","x-draft-csrf":body.csrfToken};expect((await fetch(`${origin}/creation-drafts/${body.id}/publish-intent`,{method:"POST",headers:{...headers,origin:"https://foreign.invalid"},body:'{"revision":1}'})).status).toBe(403);
    const response=await fetch(`${origin}/creation-drafts/${body.id}/publish-intent`,{method:"POST",headers,body:'{"revision":1}'});expect(response.status).toBe(201);expect(response.headers.get("set-cookie")).toContain("ticket_creation_browser=");expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");const intent=await response.json() as {id:string};const browserCookie=response.headers.get("set-cookie")!.split(";")[0]!,cookie=`${capability}; ${browserCookie}`;
    expect((await fetch(`${origin}/creation-drafts/${body.id}/publish-intents/${intent.id}`,{headers:{cookie}})).status).toBe(200);expect((await fetch(`${origin}/creation-drafts/${body.id}/publish`,{method:"POST",headers:{...headers,cookie},body:JSON.stringify({intentId:intent.id})})).status).toBe(401);expect(await prisma.event.count()).toBe(before);expect((await prisma.eventCreationDraft.findUniqueOrThrow({where:{id:body.id}})).state).toBe("active");
  });
  afterAll(async()=>{await app?.close();await prisma.eventPublishIntent.deleteMany({where:{draftId:{in:ids}}});await prisma.mediaAsset.deleteMany({where:{draftId:{in:ids}}});await prisma.eventCreationDraft.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();});
});
