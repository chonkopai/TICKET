import type { PublicEvent, PublicEventList } from "@event-platform/shared-types";
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import { ExplicitDtoPipe } from "../events/explicit-dto.pipe.js";
import { PublicEventsQueryDto } from "./public-events.dto.js";
import { PublicEventsService } from "./public-events.service.js";

@Controller("events")
export class PublicEventsController {
  constructor(@Inject(PublicEventsService) private readonly events: PublicEventsService) {}

  @Get()
  list(@Query(new ExplicitDtoPipe(PublicEventsQueryDto)) query: PublicEventsQueryDto): Promise<PublicEventList> {
    return this.events.list(query);
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string): Promise<PublicEvent> {
    return this.events.get(id);
  }
}
