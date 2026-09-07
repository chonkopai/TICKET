import type {
  CreateTableRequest,
  ReleaseTableHoldRequest,
  ReleaseTableHoldResponse,
  TableHoldResponse,
  UpdateTableRequest,
  VenueTable,
} from "@event-platform/shared-types";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { CreateTableDto, ReleaseTableHoldDto, TableListQueryDto, UpdateTableDto } from "./tables.dto.js";
import { TablesService } from "./tables.service.js";

@Controller("organizer")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerTablesController {
  constructor(@Inject(TablesService) private readonly tables: TablesService) {}

  @Post("venue-layouts/:layoutId/tables")
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("layoutId", new ParseUUIDPipe({ version: "4" })) layoutId: string,
    @Body(new ExplicitDtoPipe(CreateTableDto)) body: CreateTableRequest,
  ): Promise<VenueTable> {
    return this.tables.create(principal.userId, layoutId, body);
  }

  @Get("venue-layouts/:layoutId/tables")
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("layoutId", new ParseUUIDPipe({ version: "4" })) layoutId: string,
    @Query(new ExplicitDtoPipe(TableListQueryDto)) query: TableListQueryDto,
  ) {
    return this.tables.list(principal.userId, layoutId, query);
  }

  @Get("tables/:id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.tables.get(principal.userId, id);
  }

  @Patch("tables/:id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(UpdateTableDto)) body: UpdateTableRequest,
  ) {
    return this.tables.update(principal.userId, id, body);
  }

  @Delete("tables/:id")
  delete(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.tables.delete(principal.userId, id);
  }
}

@Controller("tables")
export class PublicTablesController {
  constructor(@Inject(TablesService) private readonly tables: TablesService) {}

  @Post(":id/hold")
  hold(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("idempotency-key") requestKey: string | undefined,
  ): Promise<TableHoldResponse> {
    return this.tables.hold(id, requestKey);
  }

  @Post(":id/release")
  release(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body(new ExplicitDtoPipe(ReleaseTableHoldDto)) body: ReleaseTableHoldRequest,
  ): Promise<ReleaseTableHoldResponse> {
    return this.tables.release(id, body.holdToken);
  }
}
