import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { Inject,Injectable,ServiceUnavailableException,UnprocessableEntityException } from "@nestjs/common";
import { DraftMediaStorage,type DraftMediaMime } from "./draft-media-storage.js";

const run=promisify(execFile);
@Injectable()
export class DraftMediaProcessor {
  constructor(@Inject(DraftMediaStorage) readonly storage:DraftMediaStorage){}
  async process(id:string,mime:DraftMediaMime){
    if(mime.startsWith("image/")){
      try{
      const input=sharp(this.storage.path(id),{limitInputPixels:40000000,failOn:"warning",sequentialRead:true});
      const decoded=await input.metadata();const expected=mime==="image/jpeg"?"jpeg":mime==="image/png"?"png":"webp";
      if(decoded.format!==expected||!decoded.width||!decoded.height||(decoded.pages??1)>1)throw new UnprocessableEntityException({code:"MEDIA_DECODE_INVALID"});
      const output=await input.rotate().webp({quality:90}).toFile(this.storage.path(id,"display.webp"));
      await sharp(this.storage.path(id,"display.webp")).resize({width:400,height:400,fit:"inside",withoutEnlargement:true}).webp({quality:80}).toFile(this.storage.path(id,"thumb.webp"));
      return{width:output.width,height:output.height,durationSeconds:null,derivatives:{display:"display.webp",thumbnail:"thumb.webp"}};
      }catch{throw new UnprocessableEntityException({code:"MEDIA_DECODE_INVALID"});}
    }
    let decoded:{streams?:Array<{codec_type?:string;width?:number;height?:number;duration?:string;disposition?:{attached_pic?:number}}> ;format?:{duration?:string;format_name?:string}};
    try{
      const output=await run(this.storage.config.ffprobe,["-v","error","-protocol_whitelist","file,pipe","-show_entries","format=duration,format_name:stream=codec_type,width,height,duration:stream_disposition=attached_pic","-of","json",this.storage.path(id)],{timeout:15000,maxBuffer:65536});
      decoded=JSON.parse(output.stdout) as typeof decoded;
    }catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT")throw new ServiceUnavailableException({code:"MEDIA_PROCESSOR_UNAVAILABLE"});throw new UnprocessableEntityException({code:"MEDIA_DECODE_INVALID"});}
    const video=decoded.streams?.find(stream=>stream.codec_type==="video"&&!stream.disposition?.attached_pic),duration=Number(decoded.format?.duration??video?.duration);
    if(!video?.width||!video.height||video.width*video.height>16000000||!Number.isFinite(duration)||duration<=0||duration>this.storage.config.videoSeconds||
      !(mime==="video/webm"?decoded.format?.format_name?.includes("webm"):decoded.format?.format_name?.includes("mp4")))throw new UnprocessableEntityException({code:"MEDIA_VIDEO_INVALID"});
    let safeDimensions={width:video.width,height:video.height};
    try{
      const poster=await run(this.storage.config.ffmpeg,["-nostdin","-v","error","-protocol_whitelist","file,pipe","-threads","2","-i",this.storage.path(id),"-map","0:v:0","-an","-frames:v","1","-vf","scale=640:640:force_original_aspect_ratio=decrease","-f","image2pipe","-c:v","png","pipe:1"],{timeout:60000,maxBuffer:2097152,encoding:"buffer"});
      await sharp(poster.stdout).webp({quality:85}).toFile(this.storage.path(id,"poster.webp"));
      await run(this.storage.config.ffmpeg,["-nostdin","-v","error","-protocol_whitelist","file,pipe","-threads","2","-i",this.storage.path(id),"-map","0:v:0","-map","0:a?","-c:a","aac","-b:a","128k","-map_metadata","-1","-c:v","libx264","-preset","fast","-crf","24","-pix_fmt","yuv420p","-vf","scale=trunc(iw/2)*2:trunc(ih/2)*2","-movflags","+faststart","-threads","2","-y",this.storage.path(id,"safe.mp4")],{timeout:180000,maxBuffer:65536});
      const safe=await run(this.storage.config.ffprobe,["-v","error","-show_entries","stream=codec_type,width,height","-of","json",this.storage.path(id,"safe.mp4")],{timeout:15000,maxBuffer:65536});
      const stream=(JSON.parse(safe.stdout) as typeof decoded).streams?.find(stream=>stream.codec_type==="video");if(!stream?.width||!stream.height)throw new Error("Invalid derivative dimensions");safeDimensions={width:stream.width,height:stream.height};
    }catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="ENOENT")throw new ServiceUnavailableException({code:"MEDIA_PROCESSOR_UNAVAILABLE"});throw new UnprocessableEntityException({code:"MEDIA_DECODE_INVALID"});}
    return{...safeDimensions,durationSeconds:duration,derivatives:{poster:"poster.webp",display:"safe.mp4",thumbnail:"poster.webp"}};
  }
}
