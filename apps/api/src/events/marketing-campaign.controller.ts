import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { SensitiveRateGuard } from "../auth/sensitive-rate.guard.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { ExplicitDtoPipe } from "./explicit-dto.pipe.js";
import { MAX_POSTER_BYTES } from "./events.constants.js";
import type { UploadedPoster } from "./object-storage.js";
import { MarketingCampaignService } from "./marketing-campaign.service.js";

class CampaignDraftDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  message!: string;
  @IsUUID("4")
  requestKey!: string;
}
class CampaignMessageDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  message!: string;
}

@Controller("organizer/events/:eventId/campaigns")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketingCampaignController {
  constructor(@Inject(MarketingCampaignService) private readonly service: MarketingCampaignService) {}

  @Get("preview")
  preview(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string) {
    return this.service.preview(actor.userId, eventId);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string) {
    return this.service.list(actor.userId, eventId);
  }

  @Post()
  createDraft(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Body(new ExplicitDtoPipe(CampaignDraftDto)) input: CampaignDraftDto) {
    return this.service.createDraft(actor.userId, eventId, input);
  }

  @Get(":campaignId")
  status(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("campaignId", new ParseUUIDPipe({ version: "4" })) campaignId: string) {
    return this.service.status(actor.userId, eventId, campaignId);
  }

  @Patch(":campaignId")
  updateDraft(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("campaignId", new ParseUUIDPipe({ version: "4" })) campaignId: string, @Body(new ExplicitDtoPipe(CampaignMessageDto)) input: CampaignMessageDto) {
    return this.service.updateDraft(actor.userId, eventId, campaignId, input.message);
  }

  @Post(":campaignId/image")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: MAX_POSTER_BYTES, files: 1 } }))
  uploadImage(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("campaignId", new ParseUUIDPipe({ version: "4" })) campaignId: string, @UploadedFile() file: UploadedPoster | undefined) {
    return this.service.uploadImage(actor.userId, eventId, campaignId, file);
  }

  @Post(":campaignId/send")
  @UseGuards(SensitiveRateGuard)
  send(@CurrentUser() actor: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string, @Param("campaignId", new ParseUUIDPipe({ version: "4" })) campaignId: string) {
    return this.service.send(actor.userId, eventId, campaignId);
  }
}
