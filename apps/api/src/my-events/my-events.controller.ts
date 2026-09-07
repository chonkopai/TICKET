import type { GuestEventList } from "@event-platform/shared-types";
import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { JwtAuthGuard } from "../auth/auth.guards.js";
import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { MyEventsQueryDto } from "./my-events.dto.js";
import { MyEventsService } from "./my-events.service.js";

@Controller("me/events")
@UseGuards(JwtAuthGuard)
export class MyEventsController {
  constructor(@Inject(MyEventsService) private readonly events: MyEventsService) {}

  @Get()
  list(@CurrentUser() principal: AuthenticatedPrincipal, @Query(new ExplicitDtoPipe(MyEventsQueryDto)) query: MyEventsQueryDto): Promise<GuestEventList> {
    return this.events.list(principal.userId, query.status, query.page, query.limit);
  }
}
