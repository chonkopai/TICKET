import { createHash } from "node:crypto";
import { createReadStream,createWriteStream } from "node:fs";
import { mkdir,open,rename,rm,stat } from "node:fs/promises";
import { join,resolve } from "node:path";
import { Transform,type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestException,Inject,Injectable } from "@nestjs/common";

export const DRAFT_MEDIA_CONFIG=Symbol("DRAFT_MEDIA_CONFIG");
export interface DraftMediaConfig {directory:string;ffmpeg:string;ffprobe:string;imageBytes:number;videoBytes:number;videoSeconds:number;draftBytes:number}
export const mediaMimeTypes=["image/jpeg","image/png","image/webp","video/mp4","video/webm"] as const;
export type DraftMediaMime=typeof mediaMimeTypes[number];
export function signatureMatches(data:Buffer,mime:string):boolean {
  if(mime==="image/jpeg")return data[0]===255&&data[1]===216&&data[2]===255;
  if(mime==="image/png")return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==="image/webp")return data.toString("ascii",0,4)==="RIFF"&&data.toString("ascii",8,12)==="WEBP";
  if(mime==="video/mp4")return data.toString("ascii",4,8)==="ftyp";
  if(mime==="video/webm")return data.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  return false;
}
@Injectable()
export class DraftMediaStorage {
  readonly directory:string;
  constructor(@Inject(DRAFT_MEDIA_CONFIG) readonly config:DraftMediaConfig){this.directory=resolve(config.directory);}
  path(id:string,variant="original"){if(!/^[0-9a-f-]{36}$/i.test(id)||!["original","thumb.webp","poster.webp","display.webp","safe.mp4"].includes(variant))throw new Error("Invalid storage key");return join(this.directory,id,variant);}
  async receive(id:string,stream:Readable,expectedBytes:number,mime:DraftMediaMime){
    const path=this.path(id);await mkdir(join(this.directory,id),{recursive:true,mode:0o700});const temporary=`${path}.incoming`;
    let bytes=0,prefix=Buffer.alloc(0);const digest=createHash("sha256"),limit=mime.startsWith("image/")?this.config.imageBytes:this.config.videoBytes;
    const measure=new Transform({transform(chunk:Buffer,_encoding,callback){bytes+=chunk.byteLength;if(bytes>expectedBytes||bytes>limit){callback(new BadRequestException({code:"MEDIA_SIZE_INVALID"}));return;}digest.update(chunk);if(prefix.length<64)prefix=Buffer.concat([prefix,chunk.subarray(0,64-prefix.length)]);callback(null,chunk);}});
    try{
      await pipeline(stream,measure,createWriteStream(temporary,{flags:"wx",mode:0o600}),{signal:AbortSignal.timeout(240000)});
      if(bytes!==expectedBytes||!signatureMatches(prefix,mime))throw new BadRequestException({code:bytes!==expectedBytes?"MEDIA_SIZE_INVALID":"MEDIA_SIGNATURE_INVALID"});
      await rename(temporary,path);return{bytes,checksum:digest.digest("hex")};
    }catch(error){await rm(temporary,{force:true});throw error;}
  }
  async prefix(id:string){const handle=await open(this.path(id),"r");try{const buffer=Buffer.alloc(64);const {bytesRead}=await handle.read(buffer,0,64,0);return buffer.subarray(0,bytesRead);}finally{await handle.close();}}
  async info(id:string,variant="original"){const path=this.path(id,variant),metadata=await stat(path);return{path,size:metadata.size};}
  read(id:string,variant="original",start?:number,end?:number){return createReadStream(this.path(id,variant),{...(start!==undefined?{start}:{}),...(end!==undefined?{end}:{})});}
  async delete(id:string){await rm(join(this.directory,id),{recursive:true,force:true});}
}
