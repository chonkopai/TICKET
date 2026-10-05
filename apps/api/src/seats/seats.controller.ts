import type { CreateTableSeatsRequest, CreateVenueRowRequest } from "@event-platform/shared-types";
import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { CreateTableSeatsDto, CreateVenueRowDto, UpdateVenueRowDto } from "./seats.dto.js";
import { SeatsService } from "./seats.service.js";

@Controller("organizer")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerSeatsController {
  constructor(@Inject(SeatsService) private readonly seats: SeatsService) {}

  @Post("tables/:tableId/seats")
  createTableSeats(@CurrentUser() user: AuthenticatedPrincipal, @Param("tableId", new ParseUUIDPipe({ version: "4" })) tableId: string, @Body(new ExplicitDtoPipe(CreateTableSeatsDto)) body: CreateTableSeatsRequest) {
    return this.seats.createForTable(user.userId, tableId, body);
  }

  @Delete("seats/:seatId")
  deleteSeat(@CurrentUser() user: AuthenticatedPrincipal, @Param("seatId", new ParseUUIDPipe({ version: "4" })) seatId: string) {
    return this.seats.deleteSeat(user.userId, seatId);
  }

  @Post("tables/:tableId/duplicate")
  duplicateTable(@CurrentUser() user: AuthenticatedPrincipal, @Param("tableId", new ParseUUIDPipe({ version: "4" })) tableId: string) {
    return this.seats.duplicateTable(user.userId, tableId);
  }

  @Post("venue-layouts/:layoutId/rows")
  createRow(@CurrentUser() user: AuthenticatedPrincipal, @Param("layoutId", new ParseUUIDPipe({ version: "4" })) layoutId: string, @Body(new ExplicitDtoPipe(CreateVenueRowDto)) body: CreateVenueRowRequest) {
    return this.seats.createRow(user.userId, layoutId, body);
  }

  @Post("venue-rows/:rowId/duplicate")
  duplicateRow(@CurrentUser() user: AuthenticatedPrincipal, @Param("rowId", new ParseUUIDPipe({ version: "4" })) rowId: string) {
    return this.seats.duplicateRow(user.userId, rowId);
  }

  @Patch("venue-rows/:rowId")
  updateRow(@CurrentUser() user: AuthenticatedPrincipal, @Param("rowId", new ParseUUIDPipe({ version: "4" })) rowId: string, @Body(new ExplicitDtoPipe(UpdateVenueRowDto)) body: UpdateVenueRowDto) {
    return this.seats.updateRow(user.userId, rowId, body);
  }

  @Delete("venue-rows/:rowId")
  deleteRow(@CurrentUser() user: AuthenticatedPrincipal, @Param("rowId", new ParseUUIDPipe({ version: "4" })) rowId: string) {
    return this.seats.deleteRow(user.userId, rowId);
  }
}

@Controller("events")
export class PublicSeatsController {
  constructor(@Inject(SeatsService) private readonly seats: SeatsService) {}

  @Get(":eventId/venue-layout")
  getPublic(@Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string,@Query("locale") locale?:string) { return this.seats.publicForEvent(eventId,locale); }
}
