import type {
  DeleteEventResponse,
  OrganizerEvent,
  OrganizerEventPreview,
  OrganizerEventList,
} from "@event-platform/shared-types";
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CreateEventDto, EventListQueryDto, UpdateEventDto } from "./events.dto.js";
import { MAX_POSTER_BYTES } from "./events.constants.js";
import { EventsService } from "./events.service.js";
import { ExplicitDtoPipe } from "./explicit-dto.pipe.js";
import { PublicEventsService } from "../public-events/public-events.service.js";
import type { UploadedPoster } from "./object-storage.js";

@Controller("organizer/events")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PublicEventsService) private readonly publicEvents: PublicEventsService,
  ) {}

  @Post()
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body(new ExplicitDtoPipe(CreateEventDto)) body: CreateEventDto,
  ): Promise<OrganizerEvent> {
    return this.events.create(principal.userId, body);
  }

  @Get()
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query(new ExplicitDtoPipe(EventListQueryDto)) query: EventListQueryDto,
  ): Promise<OrganizerEventList> {
    return this.events.list(principal.userId, query);
  }

  @Get(":id/preview")
  preview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEventPreview> {
    return this.publicEvents.preview(principal.userId, id, new Date(), principal.role === "admin");
  }

  @Get(":id")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.get(principal.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(UpdateEventDto)) body: UpdateEventDto,
  ): Promise<OrganizerEvent> {
    return this.events.update(principal.userId, id, body);
  }

  @Post(":id/publish")
  publish(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.publish(principal.userId, id);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.cancel(principal.userId, id);
  }

  @Post(":id/complete")
  complete(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.complete(principal.userId, id);
  }

  @Post(":id/poster")
  @UseInterceptors(FileInterceptor("poster", { limits: { fileSize: MAX_POSTER_BYTES, files: 1 } }))
  replacePoster(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @UploadedFile() file: UploadedPoster | undefined,
  ): Promise<OrganizerEvent> {
    return this.events.replacePoster(principal.userId, id, file);
  }

  @Delete(":id/poster")
  removePoster(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.removePoster(principal.userId, id);
  }

  @Delete(":id")
  deleteDraft(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<DeleteEventResponse> {
    return this.events.deleteDraft(principal.userId, id);
  }
}
