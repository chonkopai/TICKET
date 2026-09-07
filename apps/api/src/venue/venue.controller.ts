import type {
  ApplyVenueTemplateRequest,
  CreateVenueLayoutRequest,
  CreateVenueTemplateRequest,
  UpdateVenueLayoutRequest,
  VenueLayout,
  VenueTemplateList,
} from "@event-platform/shared-types";
import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { ApplyVenueTemplateDto, CreateVenueLayoutDto, CreateVenueTemplateDto, UpdateVenueLayoutDto, VenueListQueryDto } from "./venue.dto.js";
import { VenueService } from "./venue.service.js";

@Controller("organizer")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueController {
  constructor(@Inject(VenueService) private readonly venue: VenueService) {}

  @Post("events/:eventId/venue-layout")
  createEventLayout(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(CreateVenueLayoutDto)) body: CreateVenueLayoutRequest,
  ): Promise<VenueLayout> { return this.venue.createForEvent(principal.userId, eventId, body); }

  @Get("events/:eventId/venue-layout")
  getEventLayout(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
  ): Promise<VenueLayout> { return this.venue.getForEvent(principal.userId, eventId); }

  @Post("events/:eventId/venue-layout/apply-template")
  applyTemplate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(ApplyVenueTemplateDto)) body: ApplyVenueTemplateRequest,
  ): Promise<VenueLayout> { return this.venue.applyTemplate(principal.userId, eventId, body.templateId); }

  @Get("venue-layout-templates")
  listTemplates(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query(new ExplicitDtoPipe(VenueListQueryDto)) query: VenueListQueryDto,
  ): Promise<VenueTemplateList> { return this.venue.listTemplates(principal.userId, query); }

  @Post("venue-layouts/:id/templates")
  saveTemplate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(CreateVenueTemplateDto)) body: CreateVenueTemplateRequest,
  ): Promise<VenueLayout> { return this.venue.saveTemplate(principal.userId, id, body.name); }

  @Get("venue-layouts/:id")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<VenueLayout> { return this.venue.get(principal.userId, id); }

  @Patch("venue-layouts/:id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(UpdateVenueLayoutDto)) body: UpdateVenueLayoutRequest,
  ): Promise<VenueLayout> { return this.venue.update(principal.userId, id, body); }

  @Delete("venue-layouts/:id")
  delete(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) { return this.venue.delete(principal.userId, id); }
}
