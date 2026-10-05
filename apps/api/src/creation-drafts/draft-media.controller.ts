import { reserveDraftMediaSchema,creationDraftRevisionSchema } from "@event-platform/shared-types";
import { BadRequestException,Body,Controller,Delete,Get,Inject,Param,Post,Put,Req,Res,StreamableFile,UseInterceptors } from "@nestjs/common";
import type { Readable } from "node:stream";
import type { DraftRequest } from "./draft-security.js";
type Request=Readable & DraftRequest & {headers:DraftRequest["headers"] & {range?:string;"content-type"?:string;"content-length"?:string}};
type Response={status(value:number):void;setHeader(name:string,value:string):void};
import { AuthService } from "../auth/auth.service.js";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { DraftPrivateResponse,draftContext,draftParse } from "./creation-drafts.controller.js";
import { DraftMediaService } from "./draft-media.service.js";
import { eventCreationDraftSchema } from "@event-platform/shared-types";

@Controller("creation-drafts/:id/media")
@UseInterceptors(DraftPrivateResponse)
export class DraftMediaController {
  constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(AuthService) readonly auth:AuthService,@Inject(DraftMediaService) readonly media:DraftMediaService){}
  @Get() async list(@Param("id") id:string,@Req() request:Request){return this.media.list(id,await draftContext(this.drafts,this.auth,id,request));}
  @Post() async reserve(@Param("id") id:string,@Body() body:unknown,@Req() request:Request){return this.media.reserve(id,await draftContext(this.drafts,this.auth,id,request,true),draftParse(reserveDraftMediaSchema,body));}
  @Put(":assetId/upload") async upload(@Param("id") id:string,@Param("assetId") assetId:string,@Req() request:Request){return this.media.upload(id,assetId,await draftContext(this.drafts,this.auth,id,request,true),request,request.headers["content-type"]??"",request.headers["content-length"]);}
  @Post(":assetId/retry") async retry(@Param("id") id:string,@Param("assetId") assetId:string,@Body() body:unknown,@Req() request:Request){return this.media.retry(id,assetId,await draftContext(this.drafts,this.auth,id,request,true),draftParse(creationDraftRevisionSchema,body).revision);}
  @Delete(":assetId") async remove(@Param("id") id:string,@Param("assetId") assetId:string,@Body() body:unknown,@Req() request:Request){return this.media.remove(id,assetId,await draftContext(this.drafts,this.auth,id,request,true),draftParse(creationDraftRevisionSchema,body).revision);}
  @Get(":assetId/:variant") async read(@Param("id") id:string,@Param("assetId") assetId:string,@Param("variant") variant:string,@Req() request:Request,@Res({passthrough:true}) response:Response){
    const access=await draftContext(this.drafts,this.auth,id,request),row=await this.drafts.access(this.drafts.database,id,access);
    const asset=await this.media.scoped(this.drafts.database,id,assetId,eventCreationDraftSchema.parse(row.aggregate));
    if(asset.state!=="ready"||!["display","thumbnail","poster"].includes(variant))throw new BadRequestException({code:"MEDIA_NOT_READY"});
    const derivatives=asset.derivatives as Record<string,string>,file=derivatives[variant];if(!file)throw new BadRequestException({code:"MEDIA_VARIANT_UNAVAILABLE"});
    const {size}=await this.media.storage.info(assetId,file);let start:number|undefined,end:number|undefined;
    if(request.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);if(!match)throw new BadRequestException({code:"MEDIA_RANGE_INVALID"});start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new BadRequestException({code:"MEDIA_RANGE_INVALID"});response.status(206);response.setHeader("Content-Range",`bytes ${start}-${end}/${size}`);}
    response.setHeader("Accept-Ranges","bytes");return new StreamableFile(this.media.storage.read(assetId,file,start,end),{type:file.endsWith("mp4")?"video/mp4":"image/webp",length:start!==undefined?end!-start+1:size});
  }
}
