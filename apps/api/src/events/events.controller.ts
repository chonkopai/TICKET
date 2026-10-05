import type {
  DeleteEventResponse,
  ManagementEventSummary,
  OrganizerEvent,
  OrganizerEventPreview,
  OrganizerDashboard,
  OrganizerWorkspaceEventList,
  ManagementAnalyticsResponse,
  ManagementOrderDetail,
  ManagementOrderFilterOptions,
  ManagementOrderList,
} from "@event-platform/shared-types";
import {
  GoneException,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { EventListQueryDto, ManagementAnalyticsQueryDto, ManagementOrdersQueryDto } from "./events.dto.js";
import { EventsService } from "./events.service.js";
import { ExplicitDtoPipe } from "./explicit-dto.pipe.js";
import { PublicEventsService } from "../public-events/public-events.service.js";

@Controller("organizer/events")
@Roles("organizer", "admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PublicEventsService) private readonly publicEvents: PublicEventsService,
  ) {}

  // Explicit tombstones prevent older clients from silently creating legacy records.
  @Post()
  retiredCreate(): never { throw retiredEventWrite(); }

  @Patch(":id")
  retiredEdit(): never { throw retiredEventWrite(); }

  @Post(":id/publish")
  retiredPublish(): never { throw retiredEventWrite(); }

  @Post(":id/poster")
  retiredPosterUpload(): never { throw retiredEventWrite(); }

  @Delete(":id/poster")
  retiredPosterDelete(): never { throw retiredEventWrite(); }

  @Patch(":id/translations/:locale")
  retiredTranslationSave(): never { throw retiredEventWrite(); }

  @Post(":id/translations/translate")
  retiredTranslation(): never { throw retiredEventWrite(); }

  @Get()
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query(new ExplicitDtoPipe(EventListQueryDto)) query: EventListQueryDto,
  ): Promise<OrganizerWorkspaceEventList> {
    return this.events.list(principal.userId, query);
  }

  @Get("dashboard/summary")
  dashboard(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OrganizerDashboard> {
    return this.events.dashboard(principal.userId);
  }

  @Get(":id/preview")
  preview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("locale") locale?: string,
  ): Promise<OrganizerEventPreview> {
    return this.publicEvents.preview(principal.userId, id, new Date(), principal.role === "admin", locale);
  }

  @Get(":id/management-summary")
  managementSummary(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<ManagementEventSummary> {
    return this.events.managementSummary(principal.userId, id);
  }

  @Get(":id/analytics")
  managementAnalytics(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query(new ExplicitDtoPipe(ManagementAnalyticsQueryDto)) query: ManagementAnalyticsQueryDto,
  ): Promise<ManagementAnalyticsResponse> {
    return this.events.managementAnalytics(principal.userId, id, query);
  }

  @Get(":id/analytics/export")
  @Header("Cache-Control", "private, no-store")
  async managementAnalyticsExport(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query(new ExplicitDtoPipe(ManagementAnalyticsQueryDto)) query: ManagementAnalyticsQueryDto,
    @Res() response: { setHeader(name: string, value: string): void; type(value: string): void; send(value: string): void },
  ): Promise<void> {
    const csv = await this.events.managementAnalyticsExport(principal.userId, id, query);
    response.setHeader("Content-Disposition", `attachment; filename="analytics-${id}.csv"`);
    response.type("text/csv; charset=utf-8");
    response.send(csv);
  }

  @Get(":id/orders")
  managementOrders(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query(new ExplicitDtoPipe(ManagementOrdersQueryDto)) query: ManagementOrdersQueryDto,
  ): Promise<ManagementOrderList> {
    return this.events.managementOrders(principal.userId, id, query);
  }

  @Get(":id/order-filter-options")
  managementOrderFilterOptions(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<ManagementOrderFilterOptions> {
    return this.events.managementOrderFilterOptions(principal.userId, id);
  }

  @Get(":id/orders/export")
  @Header("Cache-Control", "private, no-store")
  async managementOrdersExport(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query(new ExplicitDtoPipe(ManagementOrdersQueryDto)) query: ManagementOrdersQueryDto,
    @Res() response: { setHeader(name: string, value: string): void; type(value: string): void; send(value: string): void },
  ): Promise<void> {
    const csv = await this.events.managementOrdersExport(principal.userId, id, query);
    response.setHeader("Content-Disposition", `attachment; filename="orders-${id}.csv"`);
    response.type("text/csv; charset=utf-8");
    response.send(csv);
  }

  @Get(":id/orders/:orderId")
  managementOrderDetail(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string,
  ): Promise<ManagementOrderDetail> {
    return this.events.managementOrderDetail(principal.userId, id, orderId);
  }

  @Get(":id")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.get(principal.userId, id);
  }

  @Post(":id/reopen")
  reopen(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<OrganizerEvent> {
    return this.events.reopen(principal.userId, id);
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

  @Delete(":id")
  deleteDraft(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ): Promise<DeleteEventResponse> {
    return this.events.deleteDraft(principal.userId, id);
  }
}

function retiredEventWrite(){return new GoneException({code:"EVENT_CREATION_V2_REQUIRED",message:"Use /events/create and the revisioned creation draft API. Legacy events require review before editing."});}
