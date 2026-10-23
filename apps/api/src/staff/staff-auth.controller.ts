import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from "@nestjs/common";
import {
  staffMfaResetSchema,
  staffAcceptSchema,
  staffChangeSchema,
  staffInviteSchema,
  staffLoginSchema,
  staffOtpSchema,
} from "@event-platform/shared-types";
import QRCode from "qrcode";
import { StaffAuthService, sessionCookie } from "./staff-auth.service.js";
import {
  cookieToken,
  StaffGatewayGuard,
  StaffPendingGuard,
  StaffRoles,
  StaffSessionGuard,
  type StaffRequest,
} from "./staff.guards.js";
import { parse } from "./staff.config.js";
interface Reply {
  setHeader(name: string, value: string): void;
}
@Controller("staff/auth")
@UseGuards(StaffGatewayGuard)
export class StaffAuthController {
  constructor(@Inject(StaffAuthService) private auth: StaffAuthService) {}
  private setCookie(res: Reply, result: { token: string; expiresAt: Date }) {
    res.setHeader(
      "Set-Cookie",
      sessionCookie(this.auth.config, result.token, result.expiresAt),
    );
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Reply,
  ) {
    const data = parse(staffLoginSchema, body);
    const result = await this.auth.login(data.email, data.password);
    this.setCookie(res, result);
    return result.session;
  }
  @Get("session") @UseGuards(StaffPendingGuard) async session(
    @Req() req: StaffRequest,
  ) {
    return this.auth.csrf(req.staff, cookieToken(req, this.auth.config)!);
  }
  @Post("mfa/enroll") @UseGuards(StaffPendingGuard) async enroll(
    @Req() req: StaffRequest,
  ) {
    const result = await this.auth.enrollment(req.staff);
    return { ...result, qr: await QRCode.toDataURL(result.uri) };
  }
  @Post("mfa/verify") @UseGuards(StaffPendingGuard) async verify(
    @Req() req: StaffRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Reply,
  ) {
    const { code } = parse(staffOtpSchema, body);
    const result = await this.auth.otp(req.staff, code);
    this.setCookie(res, result);
    return { ...result.session, recoveryCodes: result.recoveryCodes };
  }
  @Post("mfa/reset") @UseGuards(StaffSessionGuard) async resetMfa(
    @Req() req: StaffRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Reply,
  ) {
    const { password, code } = parse(staffMfaResetSchema, body);
    const result = await this.auth.resetMfa(req.staff, password, code);
    res.setHeader(
      "Set-Cookie",
      sessionCookie(this.auth.config, "", new Date(0)),
    );
    return result;
  }
  @Post("logout") @UseGuards(StaffPendingGuard) async logout(
    @Req() req: StaffRequest,
    @Res({ passthrough: true }) res: Reply,
  ) {
    const result = await this.auth.logout(req.staff);
    res.setHeader(
      "Set-Cookie",
      sessionCookie(this.auth.config, "", new Date(0)),
    );
    return result;
  }
  @Get("sessions") @UseGuards(StaffSessionGuard) sessions(
    @Req() req: StaffRequest,
  ) {
    return this.auth.sessions(req.staff);
  }
  @Post("sessions/:id/revoke") @UseGuards(StaffSessionGuard) revoke(
    @Req() req: StaffRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.auth.logout(req.staff, id);
  }
  @Post("recover") async recover(@Body() body: unknown) {
    const input = body as { email?: unknown };
    if (!input || typeof input.email !== "string" || input.email.length > 320)
      throw new BadRequestException({ code: "INVALID_REQUEST" });
    return this.auth.recover(input.email);
  }
  @Post("accept") async accept(@Body() body: unknown) {
    const data = parse(staffAcceptSchema, body);
    return this.auth.accept(data.token, data.password, "invite");
  }
  @Post("reset") async reset(@Body() body: unknown) {
    const data = parse(staffAcceptSchema, body);
    return this.auth.accept(data.token, data.password, "reset");
  }
  @Get("team") @StaffRoles("moderator") @UseGuards(StaffSessionGuard) team() {
    return this.auth.listStaff();
  }
  @Post("team/invite")
  @StaffRoles("moderator")
  @UseGuards(StaffSessionGuard)
  invite(@Req() req: StaffRequest, @Body() body: unknown) {
    return this.auth.invite(req.staff, parse(staffInviteSchema, body));
  }
  @Patch("team/:id")
  @StaffRoles("moderator")
  @UseGuards(StaffSessionGuard)
  change(
    @Req() req: StaffRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.auth.change(req.staff, id, parse(staffChangeSchema, body));
  }
}
