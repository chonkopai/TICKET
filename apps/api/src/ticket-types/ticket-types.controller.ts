import type {
  CreateTicketTypeRequest,
  DeleteTicketTypeResponse,
  OrganizerTicketType,
  OrganizerTicketTypeList,
  UpdateTicketTypeRequest,
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
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import {
  CreateTicketTypeDto,
  TicketTypeListQueryDto,
  UpdateTicketTypeDto,
} from "./ticket-types.dto.js";
import { TicketTypesService } from "./ticket-types.service.js";

@Controller("organizer")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketTypesController {
  constructor(@Inject(TicketTypesService) private readonly ticketTypes: TicketTypesService) {}

  @Post("events/:eventId/ticket-types")
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Body(new ExplicitDtoPipe(CreateTicketTypeDto)) body: CreateTicketTypeRequest,
  ): Promise<OrganizerTicketType> {
    return this.ticketTypes.create(principal.userId, eventId, body);
  }

  @Get("events/:eventId/ticket-types")
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,
    @Query(new ExplicitDtoPipe(TicketTypeListQueryDto)) query: TicketTypeListQueryDto,
  ): Promise<OrganizerTicketTypeList> {
    return this.ticketTypes.list(principal.userId, eventId, query);
  }

  @Get("ticket-types/:id")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerTicketType> {
    return this.ticketTypes.get(principal.userId, id);
  }

  @Patch("ticket-types/:id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(UpdateTicketTypeDto)) body: UpdateTicketTypeRequest,
  ): Promise<OrganizerTicketType> {
    return this.ticketTypes.update(principal.userId, id, body);
  }

  @Delete("ticket-types/:id")
  delete(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<DeleteTicketTypeResponse> {
    return this.ticketTypes.delete(principal.userId, id);
  }
}
