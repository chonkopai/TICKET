import { createCreationDraftSchema,creationDraftRevisionSchema,updateCreationDraftSchema } from "@event-platform/shared-types";
import { BadRequestException,Body,Controller,Delete,Get,Inject,Param,Patch,Post,Req,Res,UseInterceptors,type NestInterceptor,type ExecutionContext,type CallHandler } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { createHmac,randomBytes } from "node:crypto";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { assertOrigin,capabilityCookie,cookie,header,equalSecret,type DraftAccess,type DraftRequest } from "./draft-security.js";

type CookieResponse={setHeader(name:string,value:string|string[]):void};
export class DraftPrivateResponse implements NestInterceptor {
  intercept(context:ExecutionContext,next:CallHandler){const response=context.switchToHttp().getResponse<CookieResponse>();response.setHeader("Cache-Control","private, no-store");response.setHeader("Referrer-Policy","no-referrer");response.setHeader("X-Content-Type-Options","nosniff");return next.handle();}
}
export function draftParse<T>(schema:{safeParse(input:unknown):{success:true;data:T}|{success:false}},input:unknown):T {const parsed=schema.safeParse(input);if(!parsed.success)throw new BadRequestException({code:"DRAFT_VALIDATION_FAILED"});return parsed.data;}
export async function draftContext(drafts:CreationDraftsService,auth:AuthService,id:string,request:DraftRequest,mutation=false):Promise<DraftAccess>{
  if(mutation)assertOrigin(request,drafts.config);
  const authorization=header(request,"authorization"),principal=authorization?await auth.authenticate(authorization.replace(/^Bearer /i,"")):undefined;
  const parts=cookie(request,"ticket_creation_browser")?.split("."),signature=parts?.[0]?createHmac("sha256",drafts.config.hmacSecret).update(`draft-browser:${parts[0]}`).digest("base64url"):"";
  const quotaScope=parts?.length===2&&/^[A-Za-z0-9_-]{43}$/.test(parts[0]!)&&equalSecret(parts[1]!,signature)?`browser:${parts[0]}`:`network:${request.socket?.remoteAddress??request.ip??"unknown"}`;
  return {capability:cookie(request,capabilityCookie(id)),principal,csrf:header(request,"x-draft-csrf"),quotaScope};
}

/** Older/recovered drafts may have a capability but no valid signed browser cookie.
 * Bind the explicit, Origin/CSRF-checked Publish intent before auth starts. */
export function bindPublishBrowser(drafts:CreationDraftsService,access:DraftAccess,response:CookieResponse):DraftAccess{
 if(access.quotaScope?.startsWith("browser:"))return access;
 const browser=randomBytes(32).toString("base64url"),signature=createHmac("sha256",drafts.config.hmacSecret).update(`draft-browser:${browser}`).digest("base64url");
 response.setHeader("Set-Cookie",`ticket_creation_browser=${browser}.${signature}; Path=/api/creation-drafts; HttpOnly; Secure; SameSite=Lax; Max-Age=${drafts.config.anonymousSeconds}`);
 return {...access,quotaScope:`browser:${browser}`};
}

@Controller("creation-drafts")
@UseInterceptors(DraftPrivateResponse)
export class CreationDraftsController {
  constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(AuthService) readonly auth:AuthService){}
  @Get("capabilities") capabilities(){return {currencies:this.drafts.currencies,mediaLimits:this.drafts.config.mediaLimits};}
  async context(id:string,request:DraftRequest,mutation=false):Promise<DraftAccess>{
    return draftContext(this.drafts,this.auth,id,request,mutation);
  }
  @Post() async create(@Body() body:unknown,@Req() request:DraftRequest,@Res({passthrough:true}) response:CookieResponse){
    assertOrigin(request,this.drafts.config);
    if(header(request,"content-type")?.split(";")[0]!=="application/json")throw new BadRequestException({code:"DRAFT_VALIDATION_FAILED"});
    const {sourceLocale}=draftParse(createCreationDraftSchema,body);
    const binding=cookie(request,"ticket_creation_browser"),sign=(id:string)=>createHmac("sha256",this.drafts.config.hmacSecret).update(`draft-browser:${id}`).digest("base64url"),parts=binding?.split(".");
    const browser=parts?.length===2&&/^[A-Za-z0-9_-]{43}$/.test(parts[0]!)&&equalSecret(parts[1]!,sign(parts[0]!))?parts[0]!:randomBytes(32).toString("base64url");
    // Per-browser quota works behind the same-origin proxy; a higher network
    // ceiling still bounds fresh-cookie abuse without a global 20/hour limit.
    await this.drafts.quota(`network:${request.socket?.remoteAddress??request.ip??"unknown"}`,this.drafts.config.creationHourlyLimit*100,3600);
    const {draft,capability}=await this.drafts.create(sourceLocale,browser);
    response.setHeader("Set-Cookie",[`${capabilityCookie(draft.id)}=${capability}; Path=/api/creation-drafts; HttpOnly; Secure; SameSite=Lax; Max-Age=${this.drafts.config.anonymousSeconds}`,`ticket_creation_browser=${browser}.${sign(browser)}; Path=/api/creation-drafts; HttpOnly; Secure; SameSite=Lax; Max-Age=${this.drafts.config.anonymousSeconds}`]);
    return draft;
  }
  @Get(":id") async read(@Param("id") id:string,@Req() request:DraftRequest){return this.drafts.read(id,await this.context(id,request));}
  @Patch(":id") async update(@Param("id") id:string,@Body() body:unknown,@Req() request:DraftRequest){const {revision,patch}=draftParse(updateCreationDraftSchema,body);return this.drafts.update(id,await this.context(id,request,true),revision,patch);}
  @Post(":id/validate") async validate(@Param("id") id:string,@Body() body:unknown,@Req() request:DraftRequest){return this.drafts.validate(id,await this.context(id,request,true),draftParse(creationDraftRevisionSchema,body).revision);}
  @Delete(":id") async remove(@Param("id") id:string,@Body() body:unknown,@Req() request:DraftRequest){return this.drafts.remove(id,await this.context(id,request,true),draftParse(creationDraftRevisionSchema,body).revision);}
  @Post(":id/claim") async claim(@Param("id") id:string,@Body() body:unknown,@Req() request:DraftRequest,@Res({passthrough:true}) response:CookieResponse){
    const result=await this.drafts.claim(id,await this.context(id,request,true),draftParse(creationDraftRevisionSchema,body).revision);
    response.setHeader("Set-Cookie",`${capabilityCookie(id)}=; Path=/api/creation-drafts; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return result;
  }
}
