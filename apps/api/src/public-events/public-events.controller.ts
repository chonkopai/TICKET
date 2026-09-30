import type { PublicEvent, PublicEventList, PublicEventSummary } from "@event-platform/shared-types";
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

  @Get("locations")
  locations(): Promise<Array<{ countryCode: string; cities: string[] }>> {
    return this.events.locations();
  }

  @Get(":id")
  get(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query("locale") locale?: string): Promise<PublicEvent> {
    return this.events.get(id, new Date(), locale);
  }

  @Get(":id/summary")
  summary(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string, @Query("locale") locale?: string): Promise<PublicEventSummary | null> {
    return this.events.summary(id, new Date(), locale);
  }
}
