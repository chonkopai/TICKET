import { createHash,createHmac,timingSafeEqual } from "node:crypto";
import { ForbiddenException,NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";

export interface DraftAccess { quotaScope?:string|undefined; capability?:string|undefined;principal?:AuthenticatedPrincipal|undefined;csrf?:string|undefined }
export interface DraftRequest { headers:Record<string,string|string[]|undefined>;socket?:{remoteAddress?:string};ip?:string }
export interface DraftConfig { webOrigin:string;hmacSecret:string;secureCookies:boolean;anonymousSeconds:number;ownedSeconds:number;cleanupGraceSeconds:number;creationHourlyLimit:number;mediaLimits?:{imageBytes:number;videoBytes:number;videoSeconds:number;draftBytes:number} }
export const DRAFT_CONFIG=Symbol("DRAFT_CONFIG");
export const capabilityCookie=(id:string)=>`ticket_creation_${id.replaceAll("-","")}`;
export const sha256=(value:string)=>createHash("sha256").update(value).digest("hex");
export function equalSecret(left:string,right:string):boolean {
  const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);
}
export function header(request:DraftRequest,key:string):string|undefined { const value=request.headers[key];return Array.isArray(value)?value[0]:value; }
export function cookie(request:DraftRequest,name:string):string|undefined {
  const values=header(request,"cookie")?.split(";").map(value=>value.trim())??[];
  const matched=values.filter(value=>value.startsWith(`${name}=`));if(matched.length!==1)return undefined;
  return matched[0]!.slice(name.length+1);
}
export function assertOrigin(request:DraftRequest,config:DraftConfig):void {
  const site=header(request,"sec-fetch-site");
  if(header(request,"origin")!==new URL(config.webOrigin).origin||(site&&!["same-origin","none"].includes(site)))throw new ForbiddenException({code:"DRAFT_ORIGIN_INVALID"});
}
export function csrfFor(id:string,access:DraftAccess,secret:string,anonymous=false):string {
  const binding=!anonymous&&access.principal?`owner:${access.principal.userId}:${access.principal.sessionFamilyId??""}`:`cap:${access.capability??""}`;
  return createHmac("sha256",secret).update(`draft:${id}:${binding}`).digest("base64url");
}
export function assertCsrf(id:string,access:DraftAccess,secret:string,anonymous=false):void {
  if(!access.csrf||!equalSecret(access.csrf,csrfFor(id,access,secret,anonymous)))throw new ForbiddenException({code:"DRAFT_CSRF_INVALID"});
}
export function draftNotFound():never {throw new NotFoundException({code:"DRAFT_NOT_FOUND"});}
