import { creationDraftRevisionSchema,publishCreationDraftSchema } from "@event-platform/shared-types";
import { Body,Controller,Get,Inject,Param,ParseUUIDPipe,Post,Req,Res,UseGuards,UseInterceptors } from "@nestjs/common";
import { Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard,RolesGuard } from "../auth/auth.guards.js";
import { AuthService } from "../auth/auth.service.js";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { DraftPrivateResponse,draftContext,draftParse,bindPublishBrowser } from "./creation-drafts.controller.js";
import { capabilityCookie,type DraftRequest } from "./draft-security.js";
import { DraftPublicationService } from "./draft-publication.service.js";
@Controller("creation-drafts")
@UseInterceptors(DraftPrivateResponse)
export class DraftPublicationController {
 constructor(@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(AuthService) readonly auth:AuthService,@Inject(DraftPublicationService) readonly publication:DraftPublicationService){}
 @Post("owned/:eventId") @Roles("organizer","admin") @UseGuards(JwtAuthGuard,RolesGuard) async openOwned(@Param("eventId",new ParseUUIDPipe()) eventId:string,@Req() request:DraftRequest){return this.publication.openOwned(eventId,await draftContext(this.drafts,this.auth,eventId,request,true));}
 @Post(":id/save-owned") @Roles("organizer","admin") @UseGuards(JwtAuthGuard,RolesGuard) async saveOwned(@Param("id",new ParseUUIDPipe()) id:string,@Body() body:unknown,@Req() request:DraftRequest){return this.publication.saveOwned(id,await draftContext(this.drafts,this.auth,id,request,true),draftParse(creationDraftRevisionSchema,body).revision);}
 @Post(":id/publish-intent") async intent(@Param("id",new ParseUUIDPipe()) id:string,@Body() body:unknown,@Req() request:DraftRequest,@Res({passthrough:true}) response:{setHeader(name:string,value:string):void}){const access=bindPublishBrowser(this.drafts,await draftContext(this.drafts,this.auth,id,request,true),response);return this.publication.intent(id,access,draftParse(creationDraftRevisionSchema,body).revision);}
 @Get(":id/publish-intents/:intentId") async status(@Param("id",new ParseUUIDPipe()) id:string,@Param("intentId",new ParseUUIDPipe()) intentId:string,@Req() request:DraftRequest){return this.publication.intentStatus(id,intentId,await draftContext(this.drafts,this.auth,id,request));}
 @Post(":id/publish") async publish(@Param("id",new ParseUUIDPipe()) id:string,@Body() body:unknown,@Req() request:DraftRequest,@Res({passthrough:true}) response:{setHeader(name:string,value:string):void}){const {intentId}=draftParse(publishCreationDraftSchema,body),result=await this.publication.publish(id,intentId,await draftContext(this.drafts,this.auth,id,request,true));response.setHeader("Set-Cookie",`${capabilityCookie(id)}=; Path=/api/creation-drafts; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);return result;}
}
