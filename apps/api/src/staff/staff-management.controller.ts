import {
  staffOrderActionSchema,
  staffResendSchema,
} from "@event-platform/shared-types";
import { parse } from "./staff.config.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  StaffGatewayGuard,
  StaffRoles,
  StaffSessionGuard,
  type StaffRequest,
} from "./staff.guards.js";
import { StaffManagementService, csvCell } from "./staff-management.service.js";
import { StaffRefundsService } from "./staff-refunds.service.js";
@Controller("staff")
@UseGuards(StaffGatewayGuard, StaffSessionGuard)
export class StaffManagementController {
  constructor(
    @Inject(StaffManagementService) private service: StaffManagementService,
    @Inject(StaffRefundsService) private refunds: StaffRefundsService,
  ) {}
  @Get("users") users(@Query() query: Record<string, string | undefined>) {
    return this.service.users(query);
  }
  @Get("users/:id") user(@Req() req: StaffRequest, @Param("id") id: string) {
    return this.service.user(id, req.staff);
  }
  @Post("users/:id/block") @StaffRoles("moderator") block(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.block(id, req.staff, true, body);
  }
  @Post("users/:id/unblock") @StaffRoles("moderator") unblock(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.block(id, req.staff, false, body);
  }
  @Post("users/:id/warnings") @StaffRoles("moderator") warn(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.warning(id, req.staff, body);
  }
  @Get("events") @StaffRoles("moderator") events(
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.events(query);
  }
  @Get("events/:id") @StaffRoles("moderator") event(@Param("id") id: string) {
    return this.service.event(id);
  }
  @Post("events/:id/moderate") @StaffRoles("moderator") moderate(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.moderate(id, req.staff, body);
  }
  @Get("orders") orders(@Query() query: Record<string, string | undefined>) {
    return this.service.orders(query);
  }
  @Get("orders/:id") order(@Param("id") id: string) {
    return this.service.order(id);
  }
  @Get("orders/:id/refund") quote(
    @Param("id") id: string,
    @Query("tickets") tickets?: string,
  ) {
    return this.refunds.quote(id, tickets ? tickets.split(",") : undefined);
  }
  @Post("orders/:id/refund") refund(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.refunds.request(req.staff, id, body);
  }
  @Post("orders/:id/resend") resend(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parse(staffResendSchema, body);
    return this.service.resend(
      req.staff,
      id,
      input.key,
      input.reason,
      (input.channel ?? "auto") as "auto" | "email" | "telegram",
    );
  }
  @Post("orders/:id/cancel") cancel(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parse(staffOrderActionSchema, body);
    return this.service.cancelUnpaid(req.staff, id, input.key, input.reason);
  }
  @Post("refunds/:id/reconcile") reconcile(@Param("id") id: string) {
    return this.refunds.process(id);
  }
  @Get("finance") @StaffRoles("moderator") finance(
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.finance(query);
  }
  @Get("finance/export") @StaffRoles("moderator") async export(
    @Req() req: StaffRequest,
    @Query() query: Record<string, string | undefined>,
    @Res()
    res: { setHeader(k: string, v: string): void; send(value: string): void },
  ) {
    const data = await this.service.finance(query);
    await this.service.db.$transaction(async (tx) => {
      const { staffAudit } = await import("./staff.config.js");
      await staffAudit(tx, req.staff, "finance.exported", "finance", "csv");
    });
    const rows = [
      [
        "organizerId",
        "organizer",
        "currency",
        "sales",
        "refunds",
        "commission",
        "recordedPayouts",
        "outstanding",
        "unknownCommissionOrders",
        "testOnly",
      ],
      ...data.groups.map((row) => [
        row.organizerId,
        row.organizerName,
        row.currency,
        row.gross,
        row.refunds,
        row.commission ?? "unknown",
        row.payouts,
        row.outstanding ?? "unknown",
        row.unknownCommissionOrders,
        row.testOnly,
      ]),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=finance.csv");
    res.send(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    );
  }
  @Post("finance/payouts") @StaffRoles("moderator") payout(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ) {
    return this.service.payout(req.staff, body);
  }
  @Post("finance/payouts/:id/reverse") @StaffRoles("moderator") reverse(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.reversePayout(req.staff, id, body);
  }
  @Patch("finance/commission") @StaffRoles("moderator") commission(
    @Req() req: StaffRequest,
    @Body() body: unknown,
  ) {
    return this.service.commission(req.staff, body);
  }
  @Get("audit") @StaffRoles("moderator") audit(
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.audit(query);
  }
  @Get("issues") issues() {
    return this.service.issues();
  }
}
