import { Body,Controller,Get,Inject,Param,Post,Req,UseInterceptors } from "@nestjs/common";
import { translateDraftSchema } from "@event-platform/shared-types";
import { DraftTranslationsService } from "./draft-translations.service.js";
import { CreationDraftsService } from "./creation-drafts.service.js";
import { AuthService } from "../auth/auth.service.js";
import { DraftPrivateResponse,draftContext,draftParse } from "./creation-drafts.controller.js";
import type { DraftRequest } from "./draft-security.js";
@Controller("creation-drafts")
@UseInterceptors(DraftPrivateResponse)
export class DraftTranslationsController{
  constructor(@Inject(DraftTranslationsService) readonly translations:DraftTranslationsService,@Inject(CreationDraftsService) readonly drafts:CreationDraftsService,@Inject(AuthService) readonly auth:AuthService){}
  @Get(":id/translations") async status(@Param("id") id:string,@Req() request:DraftRequest){await this.drafts.read(id,await draftContext(this.drafts,this.auth,id,request));return {configured:this.translations.provider.configured};}
  @Post(":id/translations") async translate(@Param("id") id:string,@Body() body:unknown,@Req() request:DraftRequest){const input=draftParse(translateDraftSchema,body);return this.translations.translate(id,await draftContext(this.drafts,this.auth,id,request,true),input.revision,input.targetLocale);}
}
