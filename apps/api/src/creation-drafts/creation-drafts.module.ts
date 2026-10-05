import { loadApiEnv } from "@event-platform/config";
import { prisma } from "@event-platform/database";
import { DRAFT_LIFETIMES } from "@event-platform/shared-types";
import { Module } from "@nestjs/common";
import { createTranslationProvider } from "../events/translation-provider.js";
import { DraftTranslationsController } from "./draft-translations.controller.js";
import { DraftTranslationsService,DRAFT_TRANSLATOR } from "./draft-translations.service.js";
import { DraftPublicationController } from "./draft-publication.controller.js";
import { DraftPublicationService } from "./draft-publication.service.js";
import { PublicMediaController } from "./public-media.controller.js";
import { AuthModule } from "../auth/auth.module.js";
import { DATABASE_CLIENT } from "../auth/auth.constants.js";
import { CreationDraftsController } from "./creation-drafts.controller.js";
import { CreationDraftsService,DRAFT_CURRENCIES } from "./creation-drafts.service.js";
import { DRAFT_CONFIG,type DraftConfig } from "./draft-security.js";
import { DRAFT_MEDIA_CONFIG,DraftMediaStorage } from "./draft-media-storage.js";
import { DraftMediaProcessor } from "./draft-media-processor.js";
import { DraftMediaService } from "./draft-media.service.js";
import { DraftMediaController } from "./draft-media.controller.js";
import { configuredPaymentCurrencies } from "../booking/payment-provider.js";

@Module({imports:[AuthModule],controllers:[DraftPublicationController,CreationDraftsController,DraftMediaController,DraftTranslationsController,PublicMediaController],providers:[
  {provide:DATABASE_CLIENT,useValue:prisma},
  {provide:DRAFT_CONFIG,useFactory:():DraftConfig=>{const env=loadApiEnv();return {webOrigin:env.WEB_ORIGIN,hmacSecret:env.JWT_SECRET,secureCookies:true,anonymousSeconds:DRAFT_LIFETIMES.anonymousSeconds,ownedSeconds:DRAFT_LIFETIMES.ownedSeconds,cleanupGraceSeconds:DRAFT_LIFETIMES.recoveryGraceSeconds,creationHourlyLimit:20,mediaLimits:{imageBytes:env.MEDIA_IMAGE_MAX_BYTES,videoBytes:env.MEDIA_VIDEO_MAX_BYTES,videoSeconds:env.MEDIA_VIDEO_MAX_SECONDS,draftBytes:env.MEDIA_DRAFT_MAX_BYTES}};}},
  {provide:DRAFT_CURRENCIES,useFactory:()=>configuredPaymentCurrencies(loadApiEnv())},
  {provide:DRAFT_MEDIA_CONFIG,useFactory:()=>{const env=loadApiEnv();return {directory:env.DRAFT_MEDIA_STORAGE_DIR,ffmpeg:env.MEDIA_FFMPEG_PATH,ffprobe:env.MEDIA_FFPROBE_PATH,imageBytes:env.MEDIA_IMAGE_MAX_BYTES,videoBytes:env.MEDIA_VIDEO_MAX_BYTES,videoSeconds:env.MEDIA_VIDEO_MAX_SECONDS,draftBytes:env.MEDIA_DRAFT_MAX_BYTES};}},
  {provide:DRAFT_TRANSLATOR,useFactory:()=>createTranslationProvider(loadApiEnv())},DraftTranslationsService,
  CreationDraftsService,DraftMediaStorage,DraftMediaProcessor,DraftMediaService,DraftPublicationService,
],exports:[CreationDraftsService]})
export class CreationDraftsModule {}
