import type { FavoriteList, FavoriteMutation } from "@event-platform/shared-types";
import { Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { JwtAuthGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { FavoritesQueryDto } from "./favorites.dto.js";
import { FavoritesService } from "./favorites.service.js";

@Controller("me/favorites")
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(@Inject(FavoritesService) private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() principal: AuthenticatedPrincipal, @Query(new ExplicitDtoPipe(FavoritesQueryDto)) query: FavoritesQueryDto): Promise<FavoriteList> {
    return this.favorites.list(principal.userId, query.page, query.limit);
  }

  @Post(":eventId")
  add(@CurrentUser() principal: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string): Promise<FavoriteMutation> {
    return this.favorites.add(principal.userId, eventId);
  }

  @Delete(":eventId")
  remove(@CurrentUser() principal: AuthenticatedPrincipal, @Param("eventId", new ParseUUIDPipe({ version: "4" })) eventId: string): Promise<FavoriteMutation> {
    return this.favorites.remove(principal.userId, eventId);
  }
}
