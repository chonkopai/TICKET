import { Controller,Get,Inject,Param,ParseUUIDPipe,Req,Res,StreamableFile,BadRequestException,NotFoundException } from "@nestjs/common";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { DraftMediaStorage } from "./draft-media-storage.js";
/** Only safe derivatives of linked published assets are public. */
@Controller("media/events")
export class PublicMediaController {
 constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(DraftMediaStorage) readonly storage:DraftMediaStorage){}
 @Get(":eventId/:assetId/:variant") async read(@Param("eventId",new ParseUUIDPipe()) eventId:string,@Param("assetId",new ParseUUIDPipe()) assetId:string,@Param("variant") variant:string,@Req() request:{headers:{range?:string}},@Res({passthrough:true}) response:{status(value:number):void;setHeader(name:string,value:string):void}){
  if(!["display","poster","thumbnail"].includes(variant))throw new NotFoundException();
  const link=await this.drafts.database.eventMedia.findFirst({where:{eventId,assetId,event:{status:"published"},asset:{state:"ready",deletingAt:null}},include:{asset:true}});if(!link)throw new NotFoundException();
  const file=(link.asset.derivatives as Record<string,string>)[variant];if(!file)throw new NotFoundException();
  const {size}=await this.storage.info(assetId,file);let start:number|undefined,end:number|undefined;
  if(request.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);if(!match)throw new BadRequestException({code:"MEDIA_RANGE_INVALID"});start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)throw new BadRequestException({code:"MEDIA_RANGE_INVALID"});response.status(206);response.setHeader("Content-Range",`bytes ${start}-${end}/${size}`);}
  response.setHeader("Cache-Control","public, max-age=300");response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("Accept-Ranges","bytes");return new StreamableFile(this.storage.read(assetId,file,start,end),{type:file.endsWith("mp4")?"video/mp4":"image/webp",length:start!==undefined?end!-start+1:size});
 }
}
