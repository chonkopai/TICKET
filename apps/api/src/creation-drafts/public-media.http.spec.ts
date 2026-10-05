import "reflect-metadata";
import {Readable} from "node:stream";
import {randomUUID} from "node:crypto";
import {Module} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {beforeAll,afterAll,describe,expect,it,vi} from "vitest";
import {PublicMediaController} from "./public-media.controller.js";
import {CreationDraftsService} from "./creation-drafts.service.js";
import {DraftMediaStorage} from "./draft-media-storage.js";
const eventId=randomUUID(),assetId=randomUUID(),bytes=Buffer.from("safe-processed-media"),lookup=vi.fn(async({where}:{where:{eventId:string;assetId:string}})=>where.eventId===eventId&&where.assetId===assetId?{asset:{derivatives:{display:"safe.mp4",poster:"poster.webp"}}}:null);
@Module({controllers:[PublicMediaController],providers:[{provide:CreationDraftsService,useValue:{database:{eventMedia:{findFirst:lookup}}}},{provide:DraftMediaStorage,useValue:{info:async()=>({size:bytes.length}),read:(_id:string,_file:string,start=0,end=bytes.length-1)=>Readable.from([bytes.subarray(start,end+1)])}}]})class TestModule{}
describe("public processed media HTTP boundary",()=>{
 let app:Awaited<ReturnType<typeof NestFactory.create>>,origin:string;
 beforeAll(async()=>{app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,"127.0.0.1");origin=await app.getUrl();});afterAll(async()=>{await app.close();});
 it("serves only safe derivatives linked to a published ready asset",async()=>{const response=await fetch(`${origin}/media/events/${eventId}/${assetId}/display`);expect(response.status).toBe(200);expect(response.headers.get("content-type")).toContain("video/mp4");expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(await response.text()).toBe(bytes.toString());expect(lookup).toHaveBeenLastCalledWith(expect.objectContaining({where:expect.objectContaining({event:{status:"published"},asset:{state:"ready",deletingAt:null}})}));});
 it("never exposes originals, draft assets or cross-event IDs",async()=>{for(const path of [`${eventId}/${assetId}/original`,`${randomUUID()}/${assetId}/display`,`${eventId}/${randomUUID()}/display`])expect((await fetch(`${origin}/media/events/${path}`)).status).toBe(404);});
 it("supports bounded video ranges and rejects invalid multi/range requests",async()=>{const response=await fetch(`${origin}/media/events/${eventId}/${assetId}/display`,{headers:{range:"bytes=5-8"}});expect(response.status).toBe(206);expect(response.headers.get("content-range")).toBe(`bytes 5-8/${bytes.length}`);expect(await response.text()).toBe(bytes.subarray(5,9).toString());for(const range of ["bytes=999-1000","bytes=8-5","bytes=1-2,5-6"])expect((await fetch(`${origin}/media/events/${eventId}/${assetId}/display`,{headers:{range}})).status).toBe(400);});
});
