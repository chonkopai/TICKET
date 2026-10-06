import { draftDatabaseTests } from "./draft-test-database.js";
import { randomUUID } from "node:crypto";
import { prisma } from "@event-platform/database";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { csrfFor,type DraftAccess,type DraftConfig } from "./draft-security.js";

const config:DraftConfig={webOrigin:"http://localhost:3000",hmacSecret:"test-only-secret-for-creation-drafts",secureCookies:true,anonymousSeconds:2592000,ownedSeconds:7776000,cleanupGraceSeconds:604800,creationHourlyLimit:100};
const service=new CreationDraftsService(prisma,config,[{code:"KZT",exponent:2},{code:"USD",exponent:2}]);
const drafts:string[]=[],assets:string[]=[],users:string[]=[];
async function fixture(locale:"ru"|"en"|"kk"="ru"){
  const created=await service.create(locale,`spec:${randomUUID()}`);drafts.push(created.draft.id);
  const access:DraftAccess={capability:created.capability,csrf:created.draft.csrfToken};return{...created,access};
}
describe.runIf(draftDatabaseTests)("durable capability-scoped creation drafts",()=>{
  beforeAll(async()=>{const user=await prisma.user.create({data:{}});users.push(user.id);});
  it("round trips incomplete locales/hall/inactive modes without a placeholder event",async()=>{
    const {draft,access}=await fixture("en"),before=await prisma.event.count();
    const saved=await service.update(draft.id,access,draft.revision,{content:{en:{title:"Saved source"},kk:{}},paidGeneral:[{id:randomUUID(),active:true,amount:null,capacity:null,content:{}}],step:"details"});
    const read=await service.read(draft.id,access);expect(read.aggregate).toEqual(saved.aggregate);expect(read.aggregate.content.ru).toBeUndefined();expect(read.aggregate.currency).toBe("KZT");expect(await prisma.event.count()).toBe(before);
  });
  it("persists after authentication cancellation and denies guessed/wrong capabilities",async()=>{
    const {draft,access}=await fixture();expect((await service.read(draft.id,access)).id).toBe(draft.id);
    await expect(service.read(randomUUID(),access)).rejects.toMatchObject({status:404});await expect(service.read(draft.id,{capability:"wrong"})).rejects.toMatchObject({status:404});await expect(service.read("f".repeat(36),access)).rejects.toMatchObject({status:404});
  });
  it("rejects missing/wrong CSRF and ignores forged owner/state/metadata inputs",async()=>{
    const {draft,access}=await fixture();await expect(service.update(draft.id,{capability:access.capability},1,{})).rejects.toMatchObject({status:403});
    await expect(service.update(draft.id,{...access,csrf:"bad"},1,{})).rejects.toMatchObject({status:403});
    await expect(service.update(draft.id,access,1,{sourceLocale:"kk",ownerId:users[0]})).rejects.toMatchObject({status:422});
  });
  it("makes conflicting tabs visible rather than overwriting text",async()=>{
    const {draft,access}=await fixture();const results=await Promise.allSettled([service.update(draft.id,access,1,{content:{ru:{title:"First"}}}),service.update(draft.id,access,1,{content:{ru:{title:"Second"}}})]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);expect((await service.read(draft.id,access)).revision).toBe(2);
  });
  it("rejects cross-draft asset IDs and video card roles",async()=>{
    const a=await fixture(),b=await fixture();const asset=await prisma.mediaAsset.create({data:{draftId:b.draft.id,kind:"video"}});assets.push(asset.id);
    await expect(service.update(a.draft.id,a.access,1,{media:{slots:[asset.id,null,null,null,null],cardAssetId:asset.id}})).rejects.toMatchObject({status:422});
    await expect(service.update(b.draft.id,b.access,1,{media:{slots:[asset.id,null,null,null,null],cardAssetId:asset.id}})).rejects.toMatchObject({status:422});
  });
  it("claims only with principal plus capability, then revokes anonymous access",async()=>{
    const {draft,access}=await fixture(),principal={userId:users[0]!,role:"guest" as const,sessionFamilyId:randomUUID()};
    await expect(service.claim(draft.id,{principal,csrf:access.csrf},1)).rejects.toMatchObject({status:404});
    const claimed=await service.claim(draft.id,{...access,principal},1);expect(claimed.owned).toBe(true);expect(claimed.state).toBe("claimed");
    await expect(service.read(draft.id,access)).rejects.toMatchObject({status:404});expect((await service.read(draft.id,{principal})).id).toBe(draft.id);
    expect(claimed.csrfToken).toBe(csrfFor(draft.id,{principal},config.hmacSecret));
    await expect(service.read(draft.id,{principal:{...principal,userId:randomUUID()}})).rejects.toMatchObject({status:404});
  });
  it("reports authorized expiry, and cleanup skips publishing/referenced drafts",async()=>{
    const {draft,access}=await fixture();await prisma.eventCreationDraft.update({where:{id:draft.id},data:{expiresAt:new Date(Date.now()-1),capabilityExpiresAt:new Date(Date.now()-1),createdAt:new Date(Date.now()-1000)}});
    await expect(service.read(draft.id,access)).rejects.toMatchObject({status:410});await service.expire();expect((await prisma.eventCreationDraft.findUniqueOrThrow({where:{id:draft.id}})).state).toBe("expired");
    const publishing=await fixture();await prisma.eventCreationDraft.update({where:{id:publishing.draft.id},data:{state:"publishing",expiresAt:new Date(Date.now()-1),capabilityExpiresAt:new Date(Date.now()-1),createdAt:new Date(Date.now()-1000)}});await service.expire();expect((await prisma.eventCreationDraft.findUniqueOrThrow({where:{id:publishing.draft.id}})).state).toBe("publishing");
  });
  it("validates before any authentication or Event creation",async()=>{const {draft,access}=await fixture();const result=await service.validate(draft.id,access,1);expect(result.valid).toBe(false);expect(result.fields.some(field=>field.code==="SALE_MODE_REQUIRED")).toBe(true);});
  afterAll(async()=>{await prisma.mediaAsset.deleteMany({where:{id:{in:assets}}});await prisma.eventCreationDraft.deleteMany({where:{id:{in:drafts}}});await prisma.user.deleteMany({where:{id:{in:users}}});await prisma.verificationRateLimit.deleteMany({where:{scopeKey:{startsWith:"creation:"}}});await prisma.$disconnect();});
});
