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
import { EVENT_LOCALES, type EventLocale } from "@event-platform/shared-types";
import {
  BadRequestException,
  Body,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentUser, Roles } from "../auth/auth.decorators.js";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards.js";
import type { AuthenticatedPrincipal } from "../auth/auth.constants.js";
import { CreateEventDto, EventListQueryDto, ManagementAnalyticsQueryDto, ManagementOrdersQueryDto, UpdateEventDto } from "./events.dto.js";
import { MAX_POSTER_BYTES } from "./events.constants.js";
import { EventsService } from "./events.service.js";
import { EventTranslationsService } from "./event-translations.service.js";
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
    @Inject(EventTranslationsService) private readonly translations: EventTranslationsService,
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

  @Get(":id/translations")
  listTranslations(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.translations.list(id, principal.userId, principal.role === "admin");
  }

  @Patch(":id/translations/:locale")
  saveTranslation(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Param("locale") locale: string,
    @Body() content: unknown,
  ) {
    return this.translations.save(id, principal.userId, locale, content, principal.role === "admin");
  }

  @Post(":id/translations/translate")
  translate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: { overwriteManual?: boolean; targetLocale?: EventLocale },
  ) {
    if (body?.overwriteManual !== undefined && typeof body.overwriteManual !== "boolean") {
      throw new BadRequestException("overwriteManual must be a boolean");
    }
    if (body?.targetLocale !== undefined && !EVENT_LOCALES.some((locale) => locale === body.targetLocale)) {
      throw new BadRequestException("Unsupported target language");
    }
    return this.translations.translate(id, principal.userId, body?.overwriteManual === true, principal.role === "admin", body?.targetLocale);
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
